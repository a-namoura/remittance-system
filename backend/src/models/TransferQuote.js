import mongoose from "mongoose";

const transferQuoteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sourceAmount: { type: Number, required: true, min: Number.MIN_VALUE },
    sourceCurrency: { type: String, required: true, uppercase: true, trim: true, maxlength: 10 },
    destinationCurrency: { type: String, required: true, uppercase: true, trim: true, maxlength: 10 },
    exchangeRate: { type: Number, required: true, min: Number.MIN_VALUE },
    serviceFee: { type: Number, required: true, min: 0 },
    estimatedNetworkFee: { type: Number, required: true, min: 0 },
    recipientAmount: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { timestamps: true }
);

transferQuoteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const TransferQuote = mongoose.model("TransferQuote", transferQuoteSchema);
