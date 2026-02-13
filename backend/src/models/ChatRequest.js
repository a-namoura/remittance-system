import mongoose from "mongoose";

const chatRequestSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatThread",
      required: true,
      index: true,
    },
    requesterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 280,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "paid", "cancelled"],
      default: "pending",
      index: true,
    },
    processingAt: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
    paidByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    paidTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },
    paidTxHash: {
      type: String,
      trim: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

chatRequestSchema.index({ threadId: 1, createdAt: 1 });

export const ChatRequest = mongoose.model("ChatRequest", chatRequestSchema);

