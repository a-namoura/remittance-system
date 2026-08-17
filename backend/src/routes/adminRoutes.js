import express from "express";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
import { AuditLog } from "../models/AuditLog.js";
import { ChatThread } from "../models/ChatThread.js";
import { logAudit } from "../utils/audit.js";
import { allowBodyFields, allowQueryFields } from "../middleware/allowFields.js";

export const adminRouter = express.Router();

const ADMIN_TRANSACTION_STATUSES = ["pending", "success", "failed", "cancelled"];
const ADMIN_USER_ROLES = ["user", "admin"];
const ADMIN_USER_STATUSES = ["active", "disabled"];
const ADMIN_AUDIT_ACTION_PATTERN = /^[A-Z0-9_:-]{1,80}$/;
const ADMIN_SEARCH_MAX_LENGTH = 80;

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseIntegerQuery(value, { name, defaultValue, min, max }) {
  if (value == null || value === "") return defaultValue;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    const range =
      min === max ? `${min}` : `${min} and ${max}`;
    const error = new Error(`${name} must be an integer between ${range}.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function optionalEnumQuery(value, { name, allowed }) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (!allowed.includes(normalized)) {
    const error = new Error(`${name} must be one of: ${allowed.join(", ")}.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function validateSearchQuery(value) {
  const normalized = String(value || "").trim();
  if (normalized.length > ADMIN_SEARCH_MAX_LENGTH) {
    const error = new Error(
      `search cannot exceed ${ADMIN_SEARCH_MAX_LENGTH} characters.`
    );
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function nextAdminError(res, next, err) {
  if (err?.statusCode) {
    res.status(err.statusCode);
  }
  next(err);
}

// Admins can review only plaintext a participant deliberately disclosed in a report.
// This endpoint never reads ChatMessage documents or encrypted conversation history.
adminRouter.get(
  "/chat-reports",
  allowQueryFields(["limit"]),
  allowBodyFields([]),
  async (req, res, next) => {
    try {
      const limit = parseIntegerQuery(req.query.limit, {
        name: "limit",
        defaultValue: 50,
        min: 1,
        max: 100,
      });
      const threads = await ChatThread.find({ "reports.0": { $exists: true } })
        .select("reports")
        .lean();
      const reports = threads
        .flatMap((thread) =>
          (thread.reports || []).map((report) => ({
            threadId: thread._id,
            reportedByUserId: report.reportedByUserId,
            targetUserId: report.targetUserId,
            reason: report.reason,
            revealedMessages: report.revealedMessages || [],
            createdAt: report.createdAt,
          }))
        )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

      await logAudit({
        user: req.user,
        action: "ADMIN_VIEW_CHAT_REPORTS",
        metadata: { endpoint: "/api/admin/chat-reports", returned: reports.length },
        req,
      });
      res.json({ ok: true, reports });
    } catch (err) {
      nextAdminError(res, next, err);
    }
  }
);

// GET /api/admin/summary
adminRouter.get(
  "/summary",
  allowQueryFields([]),
  allowBodyFields([]),
  async (req, res, next) => {
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
      cancelledCount,
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
      Transaction.countDocuments({ status: "cancelled" }),
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
            cancelled: cancelledCount,
          },
        },
      },
    });
  } catch (err) {
    next(err);
  }
  }
);

// GET /api/admin/transactions?limit=&page=&status=
adminRouter.get(
  "/transactions",
  allowQueryFields(["limit", "page", "status"]),
  allowBodyFields([]),
  async (req, res, next) => {
  try {
    const {
      status: rawStatus,
      page = "1",
      limit = "20",
    } = req.query;
    const status = optionalEnumQuery(rawStatus, {
      name: "status",
      allowed: ADMIN_TRANSACTION_STATUSES,
    });
    const numericLimit = parseIntegerQuery(limit, {
      name: "limit",
      defaultValue: 20,
      min: 1,
      max: 100,
    });
    const numericPage = parseIntegerQuery(page, {
      name: "page",
      defaultValue: 1,
      min: 1,
      max: 10000,
    });

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

    const query = {};
    if (status) {
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
        failureReason: t.failureReason || null,
        blockchainResultReceivedAt: t.blockchainResultReceivedAt || null,
        blockchainSyncedAt: t.blockchainSyncedAt || null,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    nextAdminError(res, next, err);
  }
  }
);

// GET /api/admin/users?limit=&page=&search=&role=&status=
adminRouter.get(
  "/users",
  allowQueryFields(["limit", "page", "search", "role", "status"]),
  allowBodyFields([]),
  async (req, res, next) => {
  try {
    const {
      limit = "20",
      page = "1",
      search: rawSearch = "",
      role: rawRole,
      status: rawStatus,
    } = req.query;
    const search = validateSearchQuery(rawSearch);
    const role = optionalEnumQuery(rawRole, {
      name: "role",
      allowed: ADMIN_USER_ROLES,
    });
    const status = optionalEnumQuery(rawStatus, {
      name: "status",
      allowed: ADMIN_USER_STATUSES,
    });
    const numericLimit = parseIntegerQuery(limit, {
      name: "limit",
      defaultValue: 20,
      min: 1,
      max: 100,
    });
    const numericPage = parseIntegerQuery(page, {
      name: "page",
      defaultValue: 1,
      min: 1,
      max: 10000,
    });

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

    const query = {};

    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      query.$or = [{ email: regex }, { username: regex }];
    }

    if (role) {
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
    nextAdminError(res, next, err);
  }
  }
);

/**
 * PATCH /api/admin/users/:id/disable
 *
 * Body: { isDisabled: boolean }
 * Allows admin to disable/enable a user account.
 */
adminRouter.patch(
  "/users/:id/disable",
  allowQueryFields([]),
  allowBodyFields(["isDisabled"]),
  async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isDisabled } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
      res.status(400);
      throw new Error("Invalid user id.");
    }

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

    const wasDisabled = user.isDisabled;
    user.isDisabled = isDisabled;
    if (!wasDisabled && isDisabled) {
      user.sessionVersion = Number(user.sessionVersion || 0) + 1;
    }
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
    nextAdminError(res, next, err);
  }
  }
);

/**
 * GET /api/admin/audit-logs?limit=&page=&action=
 *
 * Paginated audit logs for monitoring admin + system actions.
 * This is used by the AdminAuditLogs.jsx page.
 */
adminRouter.get(
  "/audit-logs",
  allowQueryFields(["limit", "page", "action"]),
  allowBodyFields([]),
  async (req, res, next) => {
  try {
    const {
      limit = "50",
      page = "1",
      action: rawAction,
    } = req.query;
    const numericLimit = parseIntegerQuery(limit, {
      name: "limit",
      defaultValue: 50,
      min: 1,
      max: 200,
    });
    const numericPage = parseIntegerQuery(page, {
      name: "page",
      defaultValue: 1,
      min: 1,
      max: 10000,
    });
    const action = String(rawAction || "").trim();
    if (action && !ADMIN_AUDIT_ACTION_PATTERN.test(action)) {
      res.status(400);
      throw new Error(
        "action must be 1-80 characters using uppercase letters, numbers, underscores, colons, or hyphens."
      );
    }

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
    nextAdminError(res, next, err);
  }
  }
);
