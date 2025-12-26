import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    receiverUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    senderWallet: { type: String, required: true, lowercase: true, trim: true },
    receiverWallet: { type: String, required: true, lowercase: true, trim: true },

    amount: { type: Number, required: true, min: 0 },
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
