import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

export const Admin = mongoose.model("Admin", adminSchema);
