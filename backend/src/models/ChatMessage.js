import mongoose from "mongoose";

const encryptedPayloadSchema = new mongoose.Schema(
  {
    ciphertext: {
      type: String,
      required: function requireUserSender() { return this.messageType !== "system"; },
      trim: true,
      maxlength: 16000,
    },
    iv: {
      type: String,
      required: function requireUserRecipient() { return this.messageType !== "system"; },
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
      enum: ["text", "request", "system"],
      default: "text",
      required: true,
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRequest",
      index: true,
    },
    systemText: { type: String, trim: true, maxlength: 1000 },
    cipherForSender: {
      type: encryptedPayloadSchema,
      required: function requireSenderCipher() { return this.messageType !== "system"; },
    },
    cipherForRecipient: {
      type: encryptedPayloadSchema,
      required: function requireRecipientCipher() { return this.messageType !== "system"; },
    },
  },
  { timestamps: true }
);

chatMessageSchema.index({ threadId: 1, createdAt: 1 });

chatMessageSchema.pre("validate", function validateSystemMessage() {
  if (this.messageType === "system" && !String(this.systemText || "").trim()) {
    this.invalidate("systemText", "A system message must include text.");
  }
});

export const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
