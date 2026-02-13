import mongoose from "mongoose";

const DEFAULT_ASSET_SYMBOL = String(process.env.REM_NATIVE_CURRENCY || "ETH")
  .trim()
  .toUpperCase();

const paymentLinkSchema = new mongoose.Schema(
  {
    creatorUserId: {
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
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    assetSymbol: {
      type: String,
      trim: true,
      uppercase: true,
      default: DEFAULT_ASSET_SYMBOL || "ETH",
      maxlength: 10,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 280,
    },
    status: {
      type: String,
      enum: ["active", "claiming", "claimed", "expired"],
      default: "active",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    claimedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    claimedAt: {
      type: Date,
    },
    txHash: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

paymentLinkSchema.index({ status: 1, expiresAt: 1 });

export const PaymentLink = mongoose.model("PaymentLink", paymentLinkSchema);
