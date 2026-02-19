import mongoose from "mongoose";

const encryptedPayloadSchema = new mongoose.Schema(
  {
    ciphertext: {
      type: String,
      required: true,
      trim: true,
      maxlength: 16000,
    },
    iv: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    wrappedKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4096,
    },
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatThread",
      required: true,
      index: true,
    },
    senderUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    messageType: {
      type: String,
      enum: ["text", "request"],
      default: "text",
      required: true,
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRequest",
      index: true,
    },
    cipherForSender: {
      type: encryptedPayloadSchema,
      required: true,
    },
    cipherForRecipient: {
      type: encryptedPayloadSchema,
      required: true,
    },
    plaintextFallback: {
      type: String,
      trim: true,
      maxlength: 4000,
    },
  },
  { timestamps: true }
);

chatMessageSchema.index({ threadId: 1, createdAt: 1 });

export const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
