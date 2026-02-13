import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    registerCode: {
      type: String,
      select: false,
    },
    registerCodeExpiresAt: {
      type: Date,
    },
    emailVerifiedAt: {
      type: Date,
    },
    loginCode: {
      type: String,
      select: false,
    },
    loginCodeExpiresAt: {
      type: Date,
    },
    paymentCode: {
      type: String,
      select: false,
    },
    paymentCodeExpiresAt: {
      type: Date,
      select: false,
    },
    paymentCodeChannel: {
      type: String,
      enum: ["email", "phone"],
      select: false,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    countryOfResidence: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    phoneVerifiedAt: {
      type: Date,
    },
    dateOfBirth: {
      type: Date,
    },
    employmentStatus: {
      type: String,
      trim: true,
    },
    sourceOfFunds: {
      type: String,
      trim: true,
    },
    expectedMonthlyVolume: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isDisabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
