import crypto from "node:crypto";
import { AuditLog } from "../models/AuditLog.js";
import { redact } from "./logging.js";

const ALERT_WINDOW_MS = 15 * 60 * 1000;
const ALERT_THRESHOLD = 5;

function auditFields(action, metadata) {
  const normalizedAction = String(action || "UNKNOWN").trim().toUpperCase();
  if (normalizedAction === "AUDIT_ALERT") {
    return { category: "alert", outcome: "alert", severity: "critical" };
  }
  if (normalizedAction.includes("FAILED") || normalizedAction.includes("FAILURE")) {
    const category = normalizedAction.includes("LOGIN") || normalizedAction.includes("AUTH")
      ? "auth"
      : normalizedAction.includes("DUPLICATE")
        ? "duplicate"
        : normalizedAction.includes("SYNC") || normalizedAction.includes("RECONCILIATION")
          ? "sync"
          : "operation";
    return { category, outcome: "failure", severity: "warning" };
  }
  return { category: String(metadata?.category || "operation"), outcome: "success", severity: "info" };
}

function failureSignature({ category, metadata, ip }) {
  return crypto.createHash("sha256").update(JSON.stringify({
    category,
    subject: metadata?.identifierHash || metadata?.resourceHash || metadata?.syncTarget || "system",
    ip: ip || null,
  })).digest("hex");
}

async function alertRepeatedFailure({ category, metadata, ip }) {
  if (!['auth', 'duplicate', 'sync'].includes(category)) return;
  const signature = metadata.failureSignature || failureSignature({ category, metadata, ip });
  const since = new Date(Date.now() - ALERT_WINDOW_MS);
  const failures = await AuditLog.countDocuments({ category, outcome: "failure", "metadata.failureSignature": signature, createdAt: { $gte: since } });
  if (failures < ALERT_THRESHOLD) return;
  const priorAlert = await AuditLog.exists({ action: "AUDIT_ALERT", "metadata.signature": signature, createdAt: { $gte: since } });
  if (priorAlert) return;
  await AuditLog.create({
    action: "AUDIT_ALERT",
    category: "alert",
    outcome: "alert",
    severity: "critical",
    metadata: { signature, alertType: `repeated_${category}_failure`, count: failures, windowMinutes: ALERT_WINDOW_MS / 60000 },
    ip,
  });
  console.error("Audit alert: repeated failure threshold reached", { category, count: failures });
}

export function hashAuditIdentifier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export async function logAudit({ user, userId, action, metadata = {}, req }) {
  const actorUserId = user?._id || userId || null;
  const safeMetadata = redact(metadata);
  const fields = auditFields(action, safeMetadata);
  const ip = req?.ip;
  if (fields.outcome === "failure") {
    safeMetadata.failureSignature = failureSignature({ category: fields.category, metadata: safeMetadata, ip });
  }

  try {
    await AuditLog.create({
      userId: actorUserId,
      action,
      ...fields,
      metadata: safeMetadata,
      ip,
      userAgent: req?.headers?.["user-agent"],
    });
    if (fields.outcome === "failure") {
      await alertRepeatedFailure({ category: fields.category, metadata: safeMetadata, ip });
    }
  } catch (err) {
    console.error("Failed to write audit log:", err.message);
  }
}

function normalizeAuditError(err) {
  return String(err?.shortMessage || err?.reason || err?.message || "Transfer failed.")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

export async function logTransferAttempt({ user, req, flow, metadata = {} }) {
  await logAudit({
    user,
    action: "TRANSFER_ATTEMPT",
    metadata: {
      ...metadata,
      flow,
    },
    req,
  });
}

export async function logTransferResult({
  user,
  req,
  flow,
  transaction,
  error,
  metadata = {},
}) {
  const succeeded = transaction?.status === "success" && !error;
  await logAudit({
    user,
    action: "TRANSFER_RESULT",
    metadata: {
      ...metadata,
      flow,
      outcome: succeeded ? "success" : "failed",
      transactionId: transaction?._id ? String(transaction._id) : null,
      status: transaction?.status || "rejected",
      txHash: transaction?.txHash || null,
      failureReason:
        transaction?.failureReason || (error ? normalizeAuditError(error) : null),
    },
    req,
  });
}
