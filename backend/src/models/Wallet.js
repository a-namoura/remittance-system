import mongoose from "mongoose";
import {
  createInvalidWalletAddressMessage,
  formatWalletAddressForStorage,
  isValidEvmAddress,
} from "../utils/walletAddress.js";

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    address: {
      type: String,
      required: true,
      unique: true,
      set: formatWalletAddressForStorage,
      validate: {
        validator: isValidEvmAddress,
        message: createInvalidWalletAddressMessage("address"),
      },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
    },
    nativeBalance: {
      type: Number,
      min: [0, "nativeBalance cannot be negative."],
    },
    nativeBalanceSymbol: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
    },
    nativeBalanceUpdatedAt: {
      type: Date,
    },
    balanceSyncError: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

export const Wallet = mongoose.model("Wallet", walletSchema);
