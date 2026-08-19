import mongoose from "mongoose";

const paymentRequestLinkSchema = new mongoose.Schema(
  {
    requesterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    encryptedPayload: { type: String, required: true, maxlength: 8192 },
    paymentCommitment: { type: String, required: true, trim: true, maxlength: 64 },
    assetSymbol: { type: String, trim: true, uppercase: true, maxlength: 10 },
    status: {
      type: String,
      enum: ["active", "claiming", "paid", "revoked", "expired"],
      default: "active",
    },
    expiresAt: { type: Date, required: true },
    paidByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    paidAt: Date,
    claimingAt: Date,
    reservedPaymentHash: { type: String, trim: true },
    revokedAt: Date,
  },
  { timestamps: true }
);

paymentRequestLinkSchema.index({ status: 1, expiresAt: 1 });

export const PaymentRequestLink = mongoose.model(
  "PaymentRequestLink",
  paymentRequestLinkSchema
);
