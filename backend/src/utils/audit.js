import { AuditLog } from "../models/AuditLog.js";

export async function logAudit({ user, action, metadata = {}, req }) {
  if (!user || !user._id) return;

  try {
    await AuditLog.create({
      userId: user._id,
      action,
      metadata,
      ip: req?.ip,
      userAgent: req?.headers?.["user-agent"],
    });
  } catch (err) {
    console.error("Failed to write audit log:", err.message);
  }
}
