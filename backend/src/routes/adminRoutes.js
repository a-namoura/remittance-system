import express from "express";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
import { AuditLog } from "../models/AuditLog.js";
import { logAudit } from "../utils/audit.js";

export const adminRouter = express.Router();

// GET /api/admin/summary
adminRouter.get("/summary", async (req, res, next) => {
  try {
    await logAudit({
      user: req.user,
      action: "ADMIN_VIEW",
      metadata: { endpoint: "/api/admin/summary" },
      req,
    });

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

    await logAudit({
      user: req.user,
      action: "ADMIN_VIEW",
      metadata: {
        endpoint: "/api/admin/transactions",
        status: status || null,
        page,
        limit,
      },
      req,
    });

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
        assetSymbol: t.assetSymbol || null,
        status: t.status,
        txHash: t.txHash || null,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users?limit=&page=&search=&role=&status=
adminRouter.get("/users", async (req, res, next) => {
  try {
    const {
      limit = "20",
      page = "1",
      search = "",
      role,
      status,
    } = req.query;

    await logAudit({
      user: req.user,
      action: "ADMIN_VIEW",
      metadata: {
        endpoint: "/api/admin/users",
        search: search || null,
        role: role || null,
        status: status || null,
        page,
        limit,
      },
      req,
    });

    const numericLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);

    const query = {};

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [{ email: regex }, { username: regex }];
    }

    if (role && ["user", "admin"].includes(role)) {
      query.role = role;
    }

    if (status === "active") {
      query.isDisabled = false;
    } else if (status === "disabled") {
      query.isDisabled = true;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit)
        .select("email username role isDisabled createdAt updatedAt")
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({
      ok: true,
      total,
      page: numericPage,
      limit: numericLimit,
      users: users.map((u) => ({
        id: u._id,
        email: u.email,
        username: u.username || null,
        role: u.role,
        isDisabled: !!u.isDisabled,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:id/disable
 *
 * Body: { isDisabled: boolean }
 * Allows admin to disable/enable a user account.
 */
adminRouter.patch("/users/:id/disable", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isDisabled } = req.body || {};

    if (typeof isDisabled !== "boolean") {
      res.status(400);
      throw new Error("isDisabled must be a boolean.");
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404);
      throw new Error("User not found.");
    }

    // Prevent disabling yourself
    if (String(user._id) === String(req.user._id) && isDisabled) {
      res.status(400);
      throw new Error("You cannot disable your own admin account.");
    }

    // Optionally: prevent disabling last active admin
    if (user.role === "admin" && isDisabled) {
      const activeAdmins = await User.countDocuments({
        role: "admin",
        isDisabled: false,
      });
      if (activeAdmins <= 1) {
        res.status(400);
        throw new Error("Cannot disable the last active admin.");
      }
    }

    user.isDisabled = isDisabled;
    await user.save();

    await logAudit({
      user: req.user,
      action: "ADMIN_TOGGLE_USER",
      metadata: {
        targetUserId: user._id,
        targetEmail: user.email,
        isDisabled,
      },
      req,
    });

    res.json({
      ok: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username || null,
        role: user.role,
        isDisabled: user.isDisabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/audit-logs?limit=&page=&action=
 *
 * Paginated audit logs for monitoring admin + system actions.
 * This is used by the AdminAuditLogs.jsx page.
 */
adminRouter.get("/audit-logs", async (req, res, next) => {
  try {
    const {
      limit = "50",
      page = "1",
      action,
    } = req.query;

    const numericLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);

    const query = {};
    if (action) {
      query.action = action;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit)
        .populate("userId", "email role username")
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    await logAudit({
      user: req.user,
      action: "ADMIN_VIEW",
      metadata: {
        endpoint: "/api/admin/audit-logs",
        action: action || null,
        page,
        limit,
      },
      req,
    });

    res.json({
      ok: true,
      total,
      page: numericPage,
      limit: numericLimit,
      logs: logs.map((l) => ({
        id: l._id,
        userEmail: l.userId?.email || null,
        userRole: l.userId?.role || null,
        userUsername: l.userId?.username || null,
        action: l.action,
        metadata: l.metadata || {},
        ip: l.ip || null,
        userAgent: l.userAgent || null,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});
