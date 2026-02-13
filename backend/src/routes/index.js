import express from "express";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
import { Admin } from "../models/Admin.js";
import { authRouter } from "./authRoutes.js";
import { protect, requireAdmin } from "../middleware/authMiddleware.js";
import { userRouter } from "./userRoutes.js";
import { walletRouter } from "./walletRoutes.js";
import { transactionRouter } from "./transactionRoutes.js";
import { adminRouter } from "./adminRoutes.js";
import { friendRouter } from "./friendRoutes.js";
import { chatRouter } from "./chatRoutes.js";

export const apiRouter = express.Router();

apiRouter.get("/health", (req, res) => {
  res.json({ status: "API running" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/wallet", walletRouter);
apiRouter.use("/transactions", transactionRouter);
apiRouter.use("/friends", friendRouter);
apiRouter.use("/chats", chatRouter);

apiRouter.use("/admin", protect, requireAdmin, adminRouter);

apiRouter.get("/db-test", async (req, res) => {
  const [usersCount, walletsCount, txCount, adminsCount] = await Promise.all([
    User.countDocuments(),
    Wallet.countDocuments(),
    Transaction.countDocuments(),
    Admin.countDocuments(),
  ]);

  res.json({
    ok: true,
    counts: {
      users: usersCount,
      wallets: walletsCount,
      transactions: txCount,
      admins: adminsCount,
    },
  });
});

apiRouter.get("/me", protect, async (req, res, next) => {
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
