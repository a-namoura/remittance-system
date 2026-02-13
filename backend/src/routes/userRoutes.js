import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";

export const userRouter = express.Router();

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

userRouter.get("/search", protect, async (req, res, next) => {
  try {
    const rawQuery = String(req.query.query ?? req.query.q ?? "").trim();
    const parsedLimit = parseInt(String(req.query.limit ?? "8"), 10);
    const limit = Math.min(Math.max(parsedLimit || 8, 1), 20);

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
      .select("address isVerified verifiedAt")
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
            }
          : {
              linked: false,
              address: "",
              isVerified: false,
              verifiedAt: null,
            },
      },
    });
  } catch (err) {
    next(err);
  }
});
