import mongoose from "mongoose";

const idempotencyRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    endpoint: { type: String, required: true, trim: true },
    key: { type: String, required: true },
    requestHash: { type: String, required: true },
    state: { type: String, enum: ["processing", "completed"], default: "processing" },
    statusCode: { type: Number },
    responseBody: { type: mongoose.Schema.Types.Mixed },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

idempotencyRecordSchema.index(
  { userId: 1, endpoint: 1, key: 1 },
  { unique: true, name: "unique_user_endpoint_idempotency_key" }
);
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyRecord = mongoose.model("IdempotencyRecord", idempotencyRecordSchema);
