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
import { logAudit } from "../utils/audit.js";
import { liveHealth, readyHealth, summaryHealth } from "../health.js";
import { getPublicMetricsSnapshot } from "../utils/metrics.js";

export const apiRouter = express.Router();

apiRouter.get("/health/live", liveHealth);
apiRouter.get("/health/ready", readyHealth);
apiRouter.get("/health", summaryHealth);
apiRouter.get(
  "/metrics",
  (req, res, next) => {
    if (String(process.env.METRICS_PUBLIC || "false").toLowerCase() === "true") return next();
    return protect(req, res, (err) => err ? next(err) : requireAdmin(req, res, next));
  },
  (req, res) => res.json(getPublicMetricsSnapshot())
);

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/wallet", walletRouter);
apiRouter.use("/transactions", transactionRouter);
apiRouter.use("/friends", friendRouter);
apiRouter.use("/chats", chatRouter);

apiRouter.use("/admin", protect, requireAdmin, adminRouter);

apiRouter.get("/db-test", protect, requireAdmin, async (req, res) => {
  await logAudit({
    user: req.user,
    action: "ADMIN_VIEW",
    metadata: { endpoint: "/api/db-test" },
    req,
  });

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
      .select(
        "address type isVerified verifiedAt nativeBalance nativeBalanceSymbol nativeBalanceUpdatedAt balanceSyncError"
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
        isDiscoverable: req.user.isDiscoverable !== false,
        wallet: walletDoc
          ? {
              linked: true,
              address: walletDoc.address,
              type: walletDoc.type || "external",
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
              type: null,
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
