import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";

export const userRouter = express.Router();

const USER_SEARCH_MAX_LENGTH = 80;

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

userRouter.get("/search", protect, async (req, res, next) => {
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

    const query = {
      _id: { $ne: req.user._id },
      isDisabled: { $ne: true },
    };

    if (rawQuery) {
      const regex = new RegExp(escapeRegex(rawQuery), "i");
      query.$or = [
        { username: regex },
        { email: regex },
        { phoneNumber: regex },
        { firstName: regex },
        { lastName: regex },
      ];
    }

    const users = await User.find(query)
      .sort(rawQuery ? { username: 1 } : { createdAt: -1 })
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
});

userRouter.get("/me", protect, async (req, res, next) => {
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
});
