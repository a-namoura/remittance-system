import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    outcome: {
      type: String,
      enum: ["success", "failure", "info", "alert"],
      required: true,
      immutable: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      required: true,
      immutable: true,
    },
    metadata: {
      type: Object,
      default: {},
      immutable: true,
    },
    ip: {
      type: String,
      immutable: true,
    },
    userAgent: {
      type: String,
      immutable: true,
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, outcome: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });

// Audit records are evidence: the application may insert them but must never
// alter or delete them. Database credentials should also be restricted to
// insert/find permissions for this collection in production.
const appendOnlyError = () => new Error("Audit logs are append-only.");
auditLogSchema.pre("save", function preventAuditLogUpdates() {
  if (!this.isNew) throw appendOnlyError();
});
for (const operation of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
  "findOneAndReplace",
]) {
  auditLogSchema.pre(operation, appendOnlyError);
}

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
