import mongoose from "mongoose";
import {
  createInvalidWalletAddressMessage,
  formatWalletAddressForStorage,
  isValidEvmAddress,
} from "../utils/walletAddress.js";
import { IN_FLIGHT_TRANSACTION_STATUSES } from "../utils/transactionRequests.js";

const DEFAULT_ASSET_SYMBOL = String(process.env.REM_NATIVE_CURRENCY || "ETH")
  .trim()
  .toUpperCase();

export const TRANSACTION_STATUSES = [
  "pending",
  "success",
  "failed",
  "cancelled",
  "reconciliation-required",
];

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
      default: DEFAULT_ASSET_SYMBOL || "ETH",
      maxlength: 10,
    },
    status: {
      type: String,
      enum: TRANSACTION_STATUSES,
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
    paymentLinkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentLink",
    },
    chatRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRequest",
    },

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

export const Transaction = mongoose.model("Transaction", transactionSchema);
