import mongoose from "mongoose";
import {
  createInvalidWalletAddressMessage,
  formatWalletAddressForStorage,
  isValidEvmAddress,
} from "../utils/walletAddress.js";
import { IN_FLIGHT_TRANSACTION_STATUSES } from "../utils/transactionRequests.js";

const DEFAULT_ASSET_SYMBOL = String(process.env.REM_NATIVE_CURRENCY || "BNB")
  .trim()
  .toUpperCase();

const transactionSchema = new mongoose.Schema(
  {
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    receiverUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    senderWallet: {
      type: String,
      required: true,
      set: formatWalletAddressForStorage,
      validate: {
        validator: isValidEvmAddress,
        message: createInvalidWalletAddressMessage("senderWallet"),
      },
    },
    receiverWallet: {
      type: String,
      required: true,
      set: formatWalletAddressForStorage,
      validate: {
        validator: isValidEvmAddress,
        message: createInvalidWalletAddressMessage("receiverWallet"),
      },
    },

    amount: {
      type: Number,
      required: true,
      min: [Number.MIN_VALUE, "amount must be a positive number."],
    },
    note: { type: String, trim: true, maxlength: 280 },
    assetSymbol: {
      type: String,
      trim: true,
      uppercase: true,
      default: DEFAULT_ASSET_SYMBOL || "BNB",
      maxlength: 10,
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "cancelled", "reversed"],
      default: "pending",
    },
    txHash: { type: String, trim: true },
    failureReason: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    blockchainResultReceivedAt: {
      type: Date,
    },
    blockchainSubmittedAt: {
      type: Date,
    },
    blockchainSyncedAt: {
      type: Date,
    },
    blockNumber: {
      type: Number,
      min: 0,
    },
    blockHash: {
      type: String,
      trim: true,
    },
    eventLogIndex: {
      type: Number,
      min: 0,
    },
    blockchainTimestamp: {
      type: Date,
    },
    recordSource: {
      type: String,
      enum: ["application", "blockchain"],
      default: "application",
    },
    lastReconciledAt: {
      type: Date,
    },
    reconciliationMissCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    reconciliationError: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    transferRequestKey: {
      type: String,
      trim: true,
    },
    quoteId: { type: mongoose.Schema.Types.ObjectId, ref: "TransferQuote" },
    sourceCurrency: { type: String, trim: true, uppercase: true, maxlength: 10 },
    destinationCurrency: { type: String, trim: true, uppercase: true, maxlength: 10 },
    appliedExchangeRate: { type: Number, min: Number.MIN_VALUE },
    appliedServiceFee: { type: Number, min: 0 },
    appliedEstimatedNetworkFee: { type: Number, min: 0 },
    recipientAmount: { type: Number, min: 0 },
    // The wallet that actually signed and funded the blockchain transaction.
    // The wallet proven from the blockchain transaction. New user transfers
    // require this to match senderWallet; legacy custodial records may differ.
    onChainSenderWallet: {
      type: String,
      set: formatWalletAddressForStorage,
      validate: {
        validator: (value) => value == null || isValidEvmAddress(value),
        message: createInvalidWalletAddressMessage("onChainSenderWallet"),
      },
    },
    paymentLinkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentLink",
    },
    chatRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRequest",
    },
    reversedAt: { type: Date },
    reversedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reversalReason: { type: String, trim: true, maxlength: 500 },
    reversalStatus: { type: String, enum: ["processing", "failed", "success"] },
    reversalTxHash: { type: String, trim: true },
    reversalSubmittedAt: { type: Date },
    reversalFailureReason: { type: String, trim: true, maxlength: 1000 },
    reversalReceiverBalanceBefore: { type: Number, min: 0 },
    reversalReceiverBalanceAfter: { type: Number, min: 0 },
    reversalSenderBalanceBefore: { type: Number, min: 0 },
    reversalSenderBalanceAfter: { type: Number, min: 0 },
    reversalGasSponsored: { type: Number, min: 0, default: 0 },
    reversalGasFundingTxHash: { type: String, trim: true },

    // helpful for filters later (sent/received)
    type: {
      type: String,
      enum: ["sent", "received"],
    },
  },
  { timestamps: true }
);

transactionSchema.index(
  { transferRequestKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transferRequestKey: { $exists: true },
      status: { $in: IN_FLIGHT_TRANSACTION_STATUSES },
    },
    name: "unique_in_flight_transfer_request",
  }
);

transactionSchema.index({ status: 1, txHash: 1, updatedAt: 1 });
transactionSchema.index({ senderUserId: 1, createdAt: -1 });
transactionSchema.index({ receiverUserId: 1, createdAt: -1 });
transactionSchema.index({ senderUserId: 1, status: 1, createdAt: -1 });
transactionSchema.index({ receiverUserId: 1, status: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ paymentLinkId: 1 });
transactionSchema.index({ chatRequestId: 1 });
transactionSchema.index(
  { txHash: 1 },
  {
    unique: true,
    partialFilterExpression: { txHash: { $type: "string" } },
    name: "unique_transaction_hash",
  }
);

transactionSchema.pre("validate", function enforceFundedReversal() {
  if (
    this.status === "reversed" &&
    (this.reversalStatus !== "success" ||
      !String(this.reversalTxHash || "").trim() ||
      !this.reversedAt ||
      !Number.isFinite(this.reversalReceiverBalanceBefore) ||
      !Number.isFinite(this.reversalReceiverBalanceAfter) ||
      !Number.isFinite(this.reversalSenderBalanceBefore) ||
      !Number.isFinite(this.reversalSenderBalanceAfter) ||
      this.reversalReceiverBalanceBefore + Number(this.reversalGasSponsored || 0) - this.reversalReceiverBalanceAfter + 1e-12 < this.amount ||
      this.reversalSenderBalanceAfter - this.reversalSenderBalanceBefore + 1e-12 < this.amount)
  ) {
    this.invalidate("status", "A transaction cannot be marked reversed until the return transfer is confirmed on-chain.");
  }
});

export const Transaction = mongoose.model("Transaction", transactionSchema);
