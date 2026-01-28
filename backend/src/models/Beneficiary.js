import mongoose from "mongoose";

const beneficiarySchema = new mongoose.Schema(
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
      trim: true,
      lowercase: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 200,
    },
  },
  { timestamps: true }
);

beneficiarySchema.index(
  { userId: 1, name: 1, walletAddress: 1 },
  { unique: true }
);

export const Beneficiary = mongoose.model("Beneficiary", beneficiarySchema);
