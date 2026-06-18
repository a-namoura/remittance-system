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
  },
  { timestamps: true }
);

export const Wallet = mongoose.model("Wallet", walletSchema);
