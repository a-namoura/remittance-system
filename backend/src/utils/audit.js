import crypto from "node:crypto";
import { AuditLog } from "../models/AuditLog.js";

export function hashAuditIdentifier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export async function logAudit({ user, userId, action, metadata = {}, req }) {
  const actorUserId = user?._id || userId || null;

  try {
    await AuditLog.create({
      userId: actorUserId,
      action,
      metadata,
      ip: req?.ip,
      userAgent: req?.headers?.["user-agent"],
    });
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
