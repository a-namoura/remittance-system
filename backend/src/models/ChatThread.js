import mongoose from "mongoose";

const chatReportSchema = new mongoose.Schema(
  {
    reportedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    revealedMessages: [
      {
        messageId: {
          type: mongoose.Schema.Types.ObjectId,
        },
        plaintext: {
          type: String,
          trim: true,
          maxlength: 4000,
        },
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const chatThreadSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    participantKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    reports: [chatReportSchema],
  },
  { timestamps: true }
);

chatThreadSchema.path("participants").validate(
  (value) => Array.isArray(value) && value.length === 2,
  "Chat thread must have exactly two participants."
);

export const ChatThread = mongoose.model("ChatThread", chatThreadSchema);
