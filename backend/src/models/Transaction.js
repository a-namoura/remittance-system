import mongoose from "mongoose";
import {
  createInvalidWalletAddressMessage,
  formatWalletAddressForStorage,
  isValidEvmAddress,
} from "../utils/walletAddress.js";

const DEFAULT_ASSET_SYMBOL = String(process.env.REM_NATIVE_CURRENCY || "ETH")
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

    amount: { type: Number, required: true, min: 0 },
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
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    txHash: { type: String, trim: true },

    // helpful for filters later (sent/received)
    type: {
      type: String,
      enum: ["sent", "received"],
    },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model("Transaction", transactionSchema);
