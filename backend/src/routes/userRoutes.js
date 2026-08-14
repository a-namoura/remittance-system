import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { allowBodyFields, allowQueryFields } from "../middleware/allowFields.js";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getPasswordPolicyError } from "../controllers/authController.js";

export const userRouter = express.Router();

const USER_SEARCH_MAX_LENGTH = 80;
const PROFILE_NAME_MAX_LENGTH = 80;
export const PHONE_MAX_DIGITS = 15;
const PHONE_CHANGE_CODE_TTL_MS = 5 * 60 * 1000;

export function normalizeAndValidatePhone(value) {
  const phone = String(value || "").trim();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    const error = new Error(
      `Phone number must use international format (+ and 8-${PHONE_MAX_DIGITS} digits).`
    );
    error.statusCode = 400;
    throw error;
  }
  return phone;
}

async function requireCurrentPassword(userId, password) {
  const normalized = String(password || "");
  if (!normalized) {
    const error = new Error("Current password is required.");
    error.statusCode = 400;
    throw error;
  }
  const user = await User.findById(userId).select("+passwordHash");
  if (!user || !(await bcrypt.compare(normalized, user.passwordHash))) {
    const error = new Error("Current password is incorrect.");
    error.statusCode = 401;
    throw error;
  }
  return user;
}

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    username: user.username,
    role: user.role,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    phoneNumber: user.phoneNumber || "",
    phoneVerifiedAt: user.phoneVerifiedAt || null,
    isDiscoverable: user.isDiscoverable !== false,
  };
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

userRouter.patch(
  "/me",
  protect,
  allowQueryFields([]),
  allowBodyFields(["firstName", "lastName", "phoneNumber", "isDiscoverable"]),
  async (req, res, next) => {
    try {
      const updates = {};
      for (const field of ["firstName", "lastName"]) {
        if (req.body[field] == null) continue;
        const value = String(req.body[field]).trim();
        const max = PROFILE_NAME_MAX_LENGTH;
        if (value.length > max) {
          res.status(400);
          throw new Error(`${field} cannot exceed ${max} characters.`);
        }
        updates[field] = value;
      }
      if (req.body.phoneNumber != null) {
        const submittedPhone = String(req.body.phoneNumber).trim();
        if (submittedPhone !== String(req.user.phoneNumber || "").trim()) {
          res.status(400);
          throw new Error("Phone number changes must be verified first.");
        }
      }
      if (req.body.isDiscoverable != null) {
        if (typeof req.body.isDiscoverable !== "boolean") {
          res.status(400);
          throw new Error("isDiscoverable must be a boolean.");
        }
        updates.isDiscoverable = req.body.isDiscoverable;
      }

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updates },
        { returnDocument: "after", runValidators: true }
      );
      res.json({ ok: true, user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

userRouter.post(
  "/me/phone/send-code",
  protect,
  allowQueryFields([]),
  allowBodyFields(["phoneNumber"]),
  async (req, res, next) => {
    try {
      const phoneNumber = normalizeAndValidatePhone(req.body.phoneNumber);
      if (phoneNumber === String(req.user.phoneNumber || "").trim()) {
        res.status(400);
        throw new Error("This is already your saved phone number.");
      }
      const existing = await User.findOne({ phoneNumber, _id: { $ne: req.user._id } }).select("_id").lean();
      if (existing) {
        res.status(409);
        throw new Error("This phone number is already in use.");
      }

      const code = String(crypto.randomInt(100000, 1000000));
      req.user.pendingPhoneNumber = phoneNumber;
      req.user.phoneChangeCode = code;
      req.user.phoneChangeCodeExpiresAt = new Date(Date.now() + PHONE_CHANGE_CODE_TTL_MS);
      await req.user.save();

      // Replace this development delivery hook with the production SMS provider.
      console.info(`Phone change verification code for ${phoneNumber}: ${code}`);
      res.json({ ok: true, expiresInSeconds: PHONE_CHANGE_CODE_TTL_MS / 1000 });
    } catch (err) { next(err); }
  }
);

userRouter.post(
  "/me/deactivate",
  protect,
  allowQueryFields([]),
  allowBodyFields(["password"]),
  async (req, res, next) => {
    try {
      const user = await requireCurrentPassword(req.user._id, req.body.password);
      user.isDisabled = true;
      user.isDiscoverable = false;
      user.sessionVersion += 1;
      await user.save();
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

userRouter.post(
  "/me/change-password",
  protect,
  allowQueryFields([]),
  allowBodyFields(["currentPassword", "newPassword"]),
  async (req, res, next) => {
    try {
      const user = await requireCurrentPassword(req.user._id, req.body.currentPassword);
      const newPassword = String(req.body.newPassword || "");
      const policyError = getPasswordPolicyError(newPassword);
      if (policyError) {
        res.status(400);
        throw new Error(policyError);
      }
      if (await bcrypt.compare(newPassword, user.passwordHash)) {
        res.status(400);
        throw new Error("New password must be different from the current password.");
      }
      user.passwordHash = await bcrypt.hash(newPassword, 10);
      user.sessionVersion += 1;
      await user.save();
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

userRouter.delete(
  "/me",
  protect,
  allowQueryFields([]),
  allowBodyFields(["password", "confirmation"]),
  async (req, res, next) => {
    try {
      if (req.body.confirmation !== "DELETE") {
        res.status(400);
        throw new Error("Type DELETE to confirm account deletion.");
      }
      const user = await requireCurrentPassword(req.user._id, req.body.password);
      const erasedId = String(user._id);
      user.email = `deleted-${erasedId}@deleted.invalid`;
      user.username = `del_${erasedId}`;
      user.firstName = undefined;
      user.lastName = undefined;
      user.phoneNumber = undefined;
      user.phoneVerifiedAt = undefined;
      user.countryOfResidence = undefined;
      user.dateOfBirth = undefined;
      user.employmentStatus = undefined;
      user.sourceOfFunds = undefined;
      user.expectedMonthlyVolume = undefined;
      user.pendingPhoneNumber = undefined;
      user.phoneChangeCode = undefined;
      user.phoneChangeCodeExpiresAt = undefined;
      user.blockedUserIds = [];
      user.isDiscoverable = false;
      user.isDisabled = true;
      user.deletedAt = new Date();
      user.sessionVersion += 1;
      await user.save();
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

userRouter.post(
  "/me/phone/verify",
  protect,
  allowQueryFields([]),
  allowBodyFields(["phoneNumber", "code"]),
  async (req, res, next) => {
    try {
      const phoneNumber = normalizeAndValidatePhone(req.body.phoneNumber);
      const code = String(req.body.code || "").trim();
      if (!/^\d{6}$/.test(code)) {
        res.status(400);
        throw new Error("Enter the 6-digit verification code.");
      }
      if (!req.user.phoneChangeCode || !req.user.pendingPhoneNumber) {
        res.status(400);
        throw new Error("Request a phone verification code first.");
      }
      if (!req.user.phoneChangeCodeExpiresAt || req.user.phoneChangeCodeExpiresAt.getTime() < Date.now()) {
        res.status(400);
        throw new Error("The phone verification code has expired.");
      }
      if (req.user.pendingPhoneNumber !== phoneNumber || req.user.phoneChangeCode !== code) {
        res.status(400);
        throw new Error("Invalid phone verification code.");
      }
      const existing = await User.findOne({ phoneNumber, _id: { $ne: req.user._id } }).select("_id").lean();
      if (existing) {
        res.status(409);
        throw new Error("This phone number is already in use.");
      }

      req.user.phoneNumber = phoneNumber;
      req.user.phoneVerifiedAt = new Date();
      req.user.pendingPhoneNumber = undefined;
      req.user.phoneChangeCode = undefined;
      req.user.phoneChangeCodeExpiresAt = undefined;
      await req.user.save();
      res.json({ ok: true, user: publicUser(req.user) });
    } catch (err) { next(err); }
  }
);

userRouter.get("/blocked", protect, allowQueryFields([]), allowBodyFields([]), async (req, res, next) => {
  try {
    const owner = await User.findById(req.user._id).select("blockedUserIds").lean();
    const users = await User.find({ _id: { $in: owner?.blockedUserIds || [] } })
      .select("_id username firstName lastName")
      .sort({ username: 1 })
      .lean();
    res.json({
      ok: true,
      users: users.map((user) => ({
        id: user._id,
        username: user.username,
        displayName: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username,
      })),
    });
  } catch (err) { next(err); }
});

userRouter.post("/blocked/:userId", protect, allowQueryFields([]), allowBodyFields([]), async (req, res, next) => {
  try {
    const targetId = String(req.params.userId || "");
    if (!targetId.match(/^[a-f\d]{24}$/i) || targetId === String(req.user._id)) {
      res.status(400);
      throw new Error("Invalid user to block.");
    }
    const target = await User.findOne({ _id: targetId, isDisabled: { $ne: true } }).select("_id").lean();
    if (!target) {
      res.status(404);
      throw new Error("User not found.");
    }
    await User.updateOne({ _id: req.user._id }, { $addToSet: { blockedUserIds: target._id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

userRouter.delete("/blocked/:userId", protect, allowQueryFields([]), allowBodyFields([]), async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $pull: { blockedUserIds: req.params.userId } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

userRouter.get(
  "/search",
  protect,
  allowQueryFields(["query", "q", "limit"]),
  allowBodyFields([]),
  async (req, res, next) => {
  try {
    const rawQuery = String(req.query.query ?? req.query.q ?? "").trim();
    if (rawQuery.length > USER_SEARCH_MAX_LENGTH) {
      res.status(400);
      throw new Error(`query cannot exceed ${USER_SEARCH_MAX_LENGTH} characters.`);
    }

    const rawLimit = req.query.limit;
    const parsedLimit =
      rawLimit == null || rawLimit === "" ? 8 : Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
      res.status(400);
      throw new Error("limit must be an integer between 1 and 20.");
    }
    const limit = parsedLimit;

    if (!rawQuery) {
      res.json({ ok: true, users: [] });
      return;
    }

    const query = {
      _id: { $ne: req.user._id },
      isDisabled: { $ne: true },
      isDiscoverable: { $ne: false },
      blockedUserIds: { $ne: req.user._id },
    };

    const blockedIds = Array.isArray(req.user.blockedUserIds) ? req.user.blockedUserIds : [];
    if (blockedIds.length) query._id = { $ne: req.user._id, $nin: blockedIds };

    const regex = new RegExp(escapeRegex(rawQuery), "i");
    query.$or = [
      { username: regex },
      { firstName: regex },
      { lastName: regex },
    ];

    const users = await User.find(query)
      .sort({ username: 1 })
      .limit(limit)
      .select("_id username firstName lastName")
      .lean();

    const userIds = users.map((user) => user._id);
    const wallets = userIds.length
      ? await Wallet.find({
          userId: { $in: userIds },
          isVerified: true,
        })
          .select("userId address")
          .lean()
      : [];

    const walletByUserId = new Map(
      wallets.map((wallet) => [String(wallet.userId), wallet.address])
    );

    res.json({
      ok: true,
      users: users.map((user) => ({
        id: user._id,
        displayName:
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.username,
        username: user.username,
        walletAddress: walletByUserId.get(String(user._id)) || null,
      })),
    });
  } catch (err) {
    next(err);
  }
  }
);

userRouter.get(
  "/me",
  protect,
  allowQueryFields([]),
  allowBodyFields([]),
  async (req, res, next) => {
  try {
    const walletDoc = await Wallet.findOne({
      userId: req.user._id,
      isVerified: true,
    })
      .select(
        "address isVerified verifiedAt nativeBalance nativeBalanceSymbol nativeBalanceUpdatedAt balanceSyncError"
      )
      .lean();

    res.json({
      ok: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        username: req.user.username,
        role: req.user.role,
        firstName: req.user.firstName || "",
        lastName: req.user.lastName || "",
        phoneNumber: req.user.phoneNumber || "",
        phoneVerifiedAt: req.user.phoneVerifiedAt || null,
        isDiscoverable: req.user.isDiscoverable !== false,
        wallet: walletDoc
          ? {
              linked: true,
              address: walletDoc.address,
              isVerified: Boolean(walletDoc.isVerified),
              verifiedAt: walletDoc.verifiedAt || null,
              balance: walletDoc.nativeBalance ?? null,
              balanceSymbol: walletDoc.nativeBalanceSymbol || null,
              balanceUpdatedAt: walletDoc.nativeBalanceUpdatedAt || null,
              balanceSyncError: walletDoc.balanceSyncError || null,
            }
          : {
              linked: false,
              address: "",
              isVerified: false,
              verifiedAt: null,
              balance: null,
              balanceSymbol: null,
              balanceUpdatedAt: null,
              balanceSyncError: null,
            },
      },
    });
  } catch (err) {
    next(err);
  }
  }
);

userRouter.get(
  "/me/export",
  protect,
  allowQueryFields([]),
  allowBodyFields([]),
  async (req, res, next) => {
    try {
      const transactions = await Transaction.find({
        $or: [{ senderUserId: req.user._id }, { receiverUserId: req.user._id }],
      })
        .sort({ createdAt: -1 })
        .select("senderWallet receiverWallet amount assetSymbol note status txHash blockchainTimestamp createdAt updatedAt")
        .lean();
      res.json({
        exportedAt: new Date().toISOString(),
        profile: {
          email: req.user.email,
          username: req.user.username,
          firstName: req.user.firstName || "",
          lastName: req.user.lastName || "",
          phoneNumber: req.user.phoneNumber || "",
          phoneVerifiedAt: req.user.phoneVerifiedAt || null,
          countryOfResidence: req.user.countryOfResidence || "",
          accountCreatedAt: req.user.createdAt,
        },
        transactions,
      });
    } catch (err) { next(err); }
  }
);
