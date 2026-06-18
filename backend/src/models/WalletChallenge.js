import mongoose from "mongoose";
import {
  createInvalidWalletAddressMessage,
  formatWalletAddressForStorage,
  isValidEvmAddress,
} from "../utils/walletAddress.js";

const walletChallengeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    address: {
      type: String,
      required: true,
      set: formatWalletAddressForStorage,
      validate: {
        validator: isValidEvmAddress,
        message: createInvalidWalletAddressMessage("address"),
      },
      index: true,
    },
    messageHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    consumedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

walletChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
walletChallengeSchema.index({ userId: 1, address: 1, consumedAt: 1 });

export const WalletChallenge = mongoose.model(
  "WalletChallenge",
  walletChallengeSchema
);
