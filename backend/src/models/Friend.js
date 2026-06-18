import mongoose from "mongoose";
import {
  createInvalidWalletAddressMessage,
  formatWalletAddressForStorage,
  isValidEvmAddress,
} from "../utils/walletAddress.js";

const friendSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    username: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    walletAddress: {
      type: String,
      set: formatWalletAddressForStorage,
      validate: {
        validator(value) {
          return !value || isValidEvmAddress(value);
        },
        message: createInvalidWalletAddressMessage("walletAddress"),
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 200,
    },
  },
  { timestamps: true }
);

friendSchema.index({ userId: 1, label: 1 }, { unique: true });

export const Friend = mongoose.model("Friend", friendSchema);
