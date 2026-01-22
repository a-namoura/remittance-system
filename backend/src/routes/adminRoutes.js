import express from "express";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";

export const adminRouter = express.Router();

// GET /api/admin/summary
adminRouter.get("/summary", async (req, res, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      disabledUsers,
      totalAdmins,
      totalWallets,
      totalTransactions,
      pendingCount,
      successCount,
      failedCount,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isDisabled: false }),
      User.countDocuments({ isDisabled: true }),
      User.countDocuments({ role: "admin" }),
      Wallet.countDocuments(),
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: "pending" }),
      Transaction.countDocuments({ status: "success" }),
      Transaction.countDocuments({ status: "failed" }),
    ]);

    res.json({
      ok: true,
      summary: {
        users: {
          total: totalUsers,
          active: activeUsers,
          disabled: disabledUsers,
        },
        admins: {
          total: totalAdmins,
        },
        wallets: {
          total: totalWallets,
        },
        transactions: {
          total: totalTransactions,
          byStatus: {
            pending: pendingCount,
            success: successCount,
            failed: failedCount,
          },
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/transactions?limit=&page=&status=
adminRouter.get("/transactions", async (req, res, next) => {
  try {
    const {
      status,
      page = "1",
      limit = "20",
    } = req.query;

    const numericLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);

    const query = {};

    const allowedStatuses = ["pending", "success", "failed"];
    if (status && allowedStatuses.includes(status)) {
      query.status = status;
    }

    const [txs, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit)
        .populate("senderUserId", "email")
        .populate("receiverUserId", "email")
        .lean(),
      Transaction.countDocuments(query),
    ]);

    res.json({
      ok: true,
      total,
      page: numericPage,
      limit: numericLimit,
      transactions: txs.map((t) => ({
        id: t._id,
        senderEmail: t.senderUserId?.email || null,
        receiverEmail: t.receiverUserId?.email || null,
        senderWallet: t.senderWallet,
        receiverWallet: t.receiverWallet,
        amount: t.amount,
        status: t.status,
        txHash: t.txHash || null,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});
