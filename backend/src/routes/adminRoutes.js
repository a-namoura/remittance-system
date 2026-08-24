import express from "express";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
import { AuditLog } from "../models/AuditLog.js";
import { ChatThread } from "../models/ChatThread.js";
import { Notification } from "../models/Notification.js";
import { logAudit } from "../utils/audit.js";
import { allowBodyFields, allowQueryFields } from "../middleware/allowFields.js";
import { getEthBalance, sponsorCustodialRemittanceGas, submitCustodialRemittance } from "../blockchain/remittanceClient.js";
import { repairUnfundedReversals } from "../utils/reversalIntegrity.js";
import { updateStoredWalletBalance } from "../utils/walletBalances.js";
import { postTransactionSystemMessage } from "../utils/chatSystemMessages.js";

export const adminRouter = express.Router();

const ADMIN_TRANSACTION_STATUSES = ["pending", "success", "failed", "cancelled", "reversed"];
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

      const reportUserIds = [...new Set(reports.flatMap((report) => [
        String(report.reportedByUserId || ""),
        String(report.targetUserId || ""),
      ]).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
      const reportUsers = await User.find({ _id: { $in: reportUserIds } })
        .select("email username firstName lastName role isDisabled")
        .lean();
      const usersById = new Map(reportUsers.map((user) => [String(user._id), user]));
      const reportsWithUsers = reports.map((report) => ({
        ...report,
        reporter: usersById.get(String(report.reportedByUserId)) || null,
        reportedAccount: usersById.get(String(report.targetUserId)) || null,
      }));

      await logAudit({
        user: req.user,
        action: "ADMIN_VIEW_CHAT_REPORTS",
        metadata: { endpoint: "/api/admin/chat-reports", returned: reports.length },
        req,
      });
      res.json({ ok: true, reports: reportsWithUsers });
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
    await repairUnfundedReversals();
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
      reversedCount,
      transactionAnalytics,
      usersCreatedLast30Days,
      transactionsCreatedLast24Hours,
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
      Transaction.countDocuments({ status: "reversed" }),
      Transaction.aggregate([
        {
          $group: {
            _id: null,
            totalVolume: { $sum: "$amount" },
            averageAmount: { $avg: "$amount" },
            totalServiceFees: { $sum: { $ifNull: ["$appliedServiceFee", 0] } },
            totalNetworkFees: { $sum: { $ifNull: ["$appliedEstimatedNetworkFee", 0] } },
          },
        },
      ]),
      User.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }),
      Transaction.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
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
          totalVolume: transactionAnalytics[0]?.totalVolume || 0,
          averageAmount: transactionAnalytics[0]?.averageAmount || 0,
          totalServiceFees: transactionAnalytics[0]?.totalServiceFees || 0,
          totalNetworkFees: transactionAnalytics[0]?.totalNetworkFees || 0,
          last24Hours: transactionsCreatedLast24Hours,
          byStatus: {
            pending: pendingCount,
            success: successCount,
            failed: failedCount,
            cancelled: cancelledCount,
            reversed: reversedCount,
          },
        },
        activity: {
          usersCreatedLast30Days,
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
    await repairUnfundedReversals();
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
      max: 500,
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
        .populate("senderUserId", "email username")
        .populate("receiverUserId", "email username")
        .lean(),
      Transaction.countDocuments(query),
    ]);
    const receiverWallets = await Wallet.find({
      address: { $in: txs.map((transaction) => transaction.receiverWallet) },
      type: "custodial",
      isVerified: true,
    }).select("address").lean();
    const reversibleWallets = new Set(receiverWallets.map((wallet) => String(wallet.address).toLowerCase()));

    res.json({
      ok: true,
      total,
      page: numericPage,
      limit: numericLimit,
      transactions: txs.map((t) => ({
        id: t._id,
        senderEmail: t.senderUserId?.email || null,
        receiverEmail: t.receiverUserId?.email || null,
        senderUsername: t.senderUserId?.username || null,
        receiverUsername: t.receiverUserId?.username || null,
        senderWallet: t.senderWallet,
        receiverWallet: t.receiverWallet,
        amount: t.amount,
        assetSymbol: t.assetSymbol || null,
        status: t.status,
        canReverse: t.status === "success" && (!t.reversalStatus || (t.reversalStatus === "failed" && !t.reversalTxHash)) && reversibleWallets.has(String(t.receiverWallet).toLowerCase()),
        canCancel: t.status === "pending" && !t.txHash && !t.blockchainSubmittedAt,
        txHash: t.txHash || null,
        failureReason: t.failureReason || null,
        blockchainResultReceivedAt: t.blockchainResultReceivedAt || null,
        blockchainSubmittedAt: t.blockchainSubmittedAt || null,
        blockchainSyncedAt: t.blockchainSyncedAt || null,
        blockchainTimestamp: t.blockchainTimestamp || null,
        blockNumber: t.blockNumber ?? null,
        blockHash: t.blockHash || null,
        eventLogIndex: t.eventLogIndex ?? null,
        note: t.note || null,
        sourceCurrency: t.sourceCurrency || null,
        destinationCurrency: t.destinationCurrency || null,
        appliedExchangeRate: t.appliedExchangeRate ?? null,
        appliedServiceFee: t.appliedServiceFee ?? null,
        appliedEstimatedNetworkFee: t.appliedEstimatedNetworkFee ?? null,
        recipientAmount: t.recipientAmount ?? null,
        onChainSenderWallet: t.onChainSenderWallet || null,
        recordSource: t.recordSource || null,
        lastReconciledAt: t.lastReconciledAt || null,
        reconciliationMissCount: t.reconciliationMissCount ?? 0,
        reconciliationError: t.reconciliationError || null,
        transferRequestKey: t.transferRequestKey || null,
        quoteId: t.quoteId || null,
        paymentLinkId: t.paymentLinkId || null,
        chatRequestId: t.chatRequestId || null,
        reversedAt: t.reversedAt || null,
        reversalReason: t.reversalReason || null,
        reversalStatus: t.reversalStatus || null,
        reversalTxHash: t.reversalTxHash || null,
        reversalFailureReason: t.reversalFailureReason || null,
        type: t.type || null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (err) {
    nextAdminError(res, next, err);
  }
  }
);

// PATCH /api/admin/transactions/:id/reverse
// Returns the funds on-chain before marking the original transfer reversed.
adminRouter.patch(
  "/transactions/:id/reverse",
  allowQueryFields([]),
  allowBodyFields(["reason"]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
        res.status(400);
        throw new Error("Invalid transaction id.");
      }
      const reason = String(req.body?.reason || "Reversed by an administrator.").trim();
      if (!reason || reason.length > 500) {
        res.status(400);
        throw new Error("Reversal reason must be between 1 and 500 characters.");
      }
      const transaction = await Transaction.findOneAndUpdate(
        { _id: id, status: "success", $or: [{ reversalStatus: { $exists: false } }, { reversalStatus: "failed", reversalTxHash: { $exists: false } }] },
        { $set: { reversalStatus: "processing", reversedByAdminId: req.user._id, reversalReason: reason }, $unset: { reversalFailureReason: 1 } },
        { new: true }
      );
      if (!transaction) {
        res.status(409);
        throw new Error("Only a successful transaction can be reversed once, and no reversal may already be in progress.");
      }

      const receiverWallet = await Wallet.findOne({
        userId: transaction.receiverUserId,
        address: transaction.receiverWallet,
        type: "custodial",
        isVerified: true,
      }).select("+encryptedPrivateKey +encryptionIv +encryptionAuthTag address type");
      if (!receiverWallet) {
        await Transaction.updateOne(
          { _id: transaction._id, reversalStatus: "processing" },
          { $unset: { reversalStatus: 1, reversedByAdminId: 1, reversalReason: 1 } }
        );
        res.status(409);
        throw new Error("Automatic reversal requires the receiver's verified custodial wallet. Funds in an external wallet can only be returned with the wallet owner's signature.");
      }

      let reversal;
      let receiverBalanceBefore;
      let senderBalanceBefore;
      let receiverBalanceAfter;
      let senderBalanceAfter;
      let gasSponsorship = { sponsoredAmount: 0, txHash: null };
      const userIds = [...new Set([transaction.senderUserId, transaction.receiverUserId].filter(Boolean).map(String))];
      try {
        [receiverBalanceBefore, senderBalanceBefore] = await Promise.all([
          getEthBalance(transaction.receiverWallet),
          getEthBalance(transaction.senderWallet),
        ]);
        gasSponsorship = await sponsorCustodialRemittanceGas(receiverWallet, transaction.senderWallet, transaction.amount);
        reversal = await submitCustodialRemittance(receiverWallet, transaction.senderWallet, transaction.amount, {
          onSubmitted: async (submission) => Transaction.updateOne(
            { _id: transaction._id, reversalStatus: "processing" },
            { $set: { reversalTxHash: submission.txHash, reversalSubmittedAt: submission.submittedAt } }
          ),
        });
        const receipt = await reversal.waitForConfirmation();
        if (Number(receipt?.status) !== 1) throw new Error("The blockchain reversal transaction failed.");
        [receiverBalanceAfter, senderBalanceAfter] = await Promise.all([
          getEthBalance(transaction.receiverWallet),
          getEthBalance(transaction.senderWallet),
        ]);
        const amount = Number(transaction.amount);
        if (
          receiverBalanceBefore + gasSponsorship.sponsoredAmount - receiverBalanceAfter + 1e-12 < amount ||
          senderBalanceAfter - senderBalanceBefore + 1e-12 < amount
        ) {
          throw new Error("The return transaction was confirmed, but matching sender and receiver balance movements could not be verified.");
        }
      } catch (reversalError) {
        const failureReason = String(reversalError?.message || "Blockchain reversal failed.").slice(0, 1000);
        await Transaction.updateOne(
          { _id: transaction._id, reversalStatus: "processing" },
          { $set: { reversalStatus: "failed", reversalFailureReason: failureReason } }
        );
        throw reversalError;
      }

      const reversedAt = new Date();
      transaction.status = "reversed";
      transaction.reversalStatus = "success";
      transaction.reversalTxHash = reversal.txHash;
      transaction.reversedAt = reversedAt;
      transaction.reversalFailureReason = undefined;
      transaction.reversalReceiverBalanceBefore = receiverBalanceBefore;
      transaction.reversalReceiverBalanceAfter = receiverBalanceAfter;
      transaction.reversalSenderBalanceBefore = senderBalanceBefore;
      transaction.reversalSenderBalanceAfter = senderBalanceAfter;
      transaction.reversalGasSponsored = gasSponsorship.sponsoredAmount;
      transaction.reversalGasFundingTxHash = gasSponsorship.txHash;
      await transaction.save();
      await Promise.all([
        updateStoredWalletBalance(transaction.receiverWallet, receiverBalanceAfter),
        updateStoredWalletBalance(transaction.senderWallet, senderBalanceAfter),
      ]);

      if (userIds.length) {
        const amount = `${transaction.amount} ${transaction.assetSymbol || ""}`.trim();
        await Notification.insertMany(userIds.map((userId) => ({
          userId,
          type: "transaction_reversed",
          title: "Transaction reversed",
          message: `${amount} was returned to the sender on-chain. Reason: ${reason}`,
          transactionId: transaction._id,
        })));
      }
      await postTransactionSystemMessage({
        senderUserId: transaction.senderUserId,
        receiverUserId: transaction.receiverUserId,
        text: `${transaction.amount} ${transaction.assetSymbol || ""} was returned to the original sender. Reversal transaction: ${reversal.txHash}`,
      });

      await logAudit({
        user: req.user,
        action: "ADMIN_REVERSE_TRANSACTION",
        metadata: { transactionId: transaction._id, reversalTxHash: reversal.txHash, senderWallet: transaction.senderWallet, receiverWallet: transaction.receiverWallet, amount: transaction.amount, assetSymbol: transaction.assetSymbol, reason },
        req,
      });
      res.json({ ok: true, transaction: { id: transaction._id, status: transaction.status, canReverse: false, reversedAt, reversalReason: reason, reversalStatus: "success", reversalTxHash: reversal.txHash, updatedAt: transaction.updatedAt } });
    } catch (err) {
      nextAdminError(res, next, err);
    }
  }
);

// PATCH /api/admin/transactions/:id/cancel
// Cancels only an unsubmitted pending record. Confirmed/on-chain transfers are immutable.
adminRouter.patch(
  "/transactions/:id/cancel",
  allowQueryFields([]),
  allowBodyFields([]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
        res.status(400);
        throw new Error("Invalid transaction id.");
      }
      const transaction = await Transaction.findOneAndUpdate(
        {
          _id: id,
          status: "pending",
          $or: [{ txHash: null }, { txHash: "" }, { txHash: { $exists: false } }],
          blockchainSubmittedAt: { $exists: false },
        },
        { $set: { status: "cancelled", failureReason: "Cancelled by an administrator before blockchain submission." } },
        { new: true }
      ).lean();
      if (!transaction) {
        res.status(409);
        throw new Error("Only a pending transaction that has not been submitted to the blockchain can be cancelled. Confirmed transfers cannot be reversed.");
      }
      await logAudit({ user: req.user, action: "ADMIN_CANCEL_TRANSACTION", metadata: { transactionId: transaction._id, senderWallet: transaction.senderWallet, receiverWallet: transaction.receiverWallet, amount: transaction.amount, assetSymbol: transaction.assetSymbol }, req });
      res.json({ ok: true, transaction: { id: transaction._id, status: transaction.status, failureReason: transaction.failureReason, updatedAt: transaction.updatedAt } });
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
        .select("email username firstName lastName countryOfResidence phoneNumber emailVerifiedAt phoneVerifiedAt dateOfBirth employmentStatus sourceOfFunds expectedMonthlyVolume role isDisabled deletedAt createdAt updatedAt")
        .lean(),
      User.countDocuments(query),
    ]);

    const userIds = users.map((user) => user._id);
    const [wallets, transactionStats] = await Promise.all([
      Wallet.find({ userId: { $in: userIds } })
        .select("userId address type isVerified verifiedAt nativeBalance nativeBalanceSymbol nativeBalanceUpdatedAt balanceSyncError createdAt")
        .lean(),
      Transaction.aggregate([
        { $match: { $or: [{ senderUserId: { $in: userIds } }, { receiverUserId: { $in: userIds } }] } },
        { $facet: {
          sent: [{ $match: { senderUserId: { $in: userIds } } }, { $group: { _id: "$senderUserId", count: { $sum: 1 }, volume: { $sum: "$amount" }, failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } } } }],
          received: [{ $match: { receiverUserId: { $in: userIds } } }, { $group: { _id: "$receiverUserId", count: { $sum: 1 }, volume: { $sum: "$amount" } } }],
        } },
      ]),
    ]);
    const walletsByUserId = new Map(wallets.map((wallet) => [String(wallet.userId), wallet]));
    const sentByUserId = new Map((transactionStats[0]?.sent || []).map((item) => [String(item._id), item]));
    const receivedByUserId = new Map((transactionStats[0]?.received || []).map((item) => [String(item._id), item]));

    res.json({
      ok: true,
      total,
      page: numericPage,
      limit: numericLimit,
      users: users.map((u) => ({
        id: u._id,
        email: u.email,
        username: u.username || null,
        firstName: u.firstName || null,
        lastName: u.lastName || null,
        countryOfResidence: u.countryOfResidence || null,
        phoneNumber: u.phoneNumber || null,
        emailVerifiedAt: u.emailVerifiedAt || null,
        phoneVerifiedAt: u.phoneVerifiedAt || null,
        dateOfBirth: u.dateOfBirth || null,
        employmentStatus: u.employmentStatus || null,
        sourceOfFunds: u.sourceOfFunds || null,
        expectedMonthlyVolume: u.expectedMonthlyVolume || null,
        role: u.role,
        isDisabled: !!u.isDisabled,
        deletedAt: u.deletedAt || null,
        wallet: walletsByUserId.get(String(u._id)) || null,
        activity: {
          sentCount: sentByUserId.get(String(u._id))?.count || 0,
          sentVolume: sentByUserId.get(String(u._id))?.volume || 0,
          failedSentCount: sentByUserId.get(String(u._id))?.failed || 0,
          receivedCount: receivedByUserId.get(String(u._id))?.count || 0,
          receivedVolume: receivedByUserId.get(String(u._id))?.volume || 0,
        },
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

// GET /api/admin/suspicious-activity
// Rule-based indicators for administrator review. These are signals, not verdicts.
adminRouter.get(
  "/suspicious-activity",
  allowQueryFields(["limit"]),
  allowBodyFields([]),
  async (req, res, next) => {
    try {
      const limit = parseIntegerQuery(req.query.limit, {
        name: "limit", defaultValue: 100, min: 1, max: 500,
      });
      const stalePendingBefore = new Date(Date.now() - 15 * 60 * 1000);
      const candidates = await Transaction.find({
        $or: [
          { status: "failed" },
          { status: "pending", createdAt: { $lt: stalePendingBefore } },
          { reconciliationError: { $exists: true, $nin: [null, ""] } },
          { reconciliationMissCount: { $gt: 0 } },
          { $expr: { $and: [
            { $ne: [{ $ifNull: ["$onChainSenderWallet", ""] }, ""] },
            { $ne: [{ $toLower: "$onChainSenderWallet" }, { $toLower: "$senderWallet" }] },
          ] } },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("senderUserId", "email username firstName lastName")
        .populate("receiverUserId", "email username firstName lastName")
        .lean();

      const items = candidates.map((transaction) => {
        const reasons = [];
        let score = 0;
        if (transaction.status === "failed") { reasons.push("Transaction failed"); score += 25; }
        if (transaction.status === "pending" && new Date(transaction.createdAt) < stalePendingBefore) { reasons.push("Pending for more than 15 minutes"); score += 35; }
        if (transaction.reconciliationError) { reasons.push("Blockchain reconciliation error"); score += 35; }
        if ((transaction.reconciliationMissCount || 0) > 0) { reasons.push(`${transaction.reconciliationMissCount} reconciliation miss(es)`); score += Math.min(30, transaction.reconciliationMissCount * 10); }
        if (transaction.onChainSenderWallet && transaction.senderWallet && transaction.onChainSenderWallet.toLowerCase() !== transaction.senderWallet.toLowerCase()) { reasons.push("On-chain signer differs from recorded sender"); score += 60; }
        return {
          id: transaction._id,
          transactionId: transaction._id,
          createdAt: transaction.createdAt,
          status: transaction.status,
          amount: transaction.amount,
          assetSymbol: transaction.assetSymbol,
          txHash: transaction.txHash || null,
          sender: transaction.senderUserId || null,
          receiver: transaction.receiverUserId || null,
          senderWallet: transaction.senderWallet,
          receiverWallet: transaction.receiverWallet,
          score: Math.min(100, score),
          severity: score >= 60 ? "high" : score >= 35 ? "medium" : "low",
          reasons,
        };
      }).filter((item) => item.reasons.length > 0);

      await logAudit({ user: req.user, action: "ADMIN_VIEW_SUSPICIOUS_ACTIVITY", metadata: { endpoint: "/api/admin/suspicious-activity", returned: items.length }, req });
      res.json({ ok: true, items, rules: { stalePendingMinutes: 15 } });
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
  "/audit-log-options",
  allowQueryFields([]),
  allowBodyFields([]),
  async (req, res, next) => {
    try {
      const [actions, ips, users] = await Promise.all([
        AuditLog.distinct("action"),
        AuditLog.distinct("ip"),
        User.find({}).select("username").sort({ username: 1 }).lean(),
      ]);
      res.json({ ok: true, actions: actions.filter(Boolean).sort(), ips: ips.filter(Boolean).sort(), users: users.map((user) => user.username).filter(Boolean) });
    } catch (err) {
      nextAdminError(res, next, err);
    }
  }
);

adminRouter.get(
  "/audit-logs",
  allowQueryFields(["limit", "page", "action", "search", "user", "role", "ip", "from", "to"]),
  allowBodyFields([]),
  async (req, res, next) => {
  try {
    const {
      limit = "50",
      page = "1",
      action: rawAction,
      search: rawSearch = "",
      user: rawUser = "",
      role: rawRole,
      ip: rawIp = "",
      from: rawFrom,
      to: rawTo,
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
    const search = validateSearchQuery(rawSearch);
    const user = validateSearchQuery(rawUser);
    const role = optionalEnumQuery(rawRole, { name: "role", allowed: ADMIN_USER_ROLES });
    const ip = validateSearchQuery(rawIp);
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
    if (ip) query.ip = new RegExp(escapeRegex(ip), "i");
    if (rawFrom || rawTo) {
      query.createdAt = {};
      if (rawFrom) {
        const from = new Date(rawFrom);
        if (Number.isNaN(from.getTime())) { res.status(400); throw new Error("from must be a valid date."); }
        query.createdAt.$gte = from;
      }
      if (rawTo) {
        const to = new Date(rawTo);
        if (Number.isNaN(to.getTime())) { res.status(400); throw new Error("to must be a valid date."); }
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }
    if (role) {
      const roleUsers = await User.find({ role }).select("_id").lean();
      query.userId = { $in: roleUsers.map((user) => user._id) };
    }
    if (user) {
      const matchedUser = await User.findOne({ username: new RegExp(`^${escapeRegex(user)}$`, "i") }).select("_id").lean();
      query.userId = matchedUser?._id || { $in: [] };
    }
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      const matchingUsers = await User.find({ $or: [{ email: regex }, { username: regex }, { firstName: regex }, { lastName: regex }] }).select("_id").lean();
      query.$or = [
        { userId: { $in: matchingUsers.map((user) => user._id) } },
        { action: regex },
        { ip: regex },
        { userAgent: regex },
        { "metadata.endpoint": regex },
        { "metadata.targetEmail": regex },
        { "metadata.transactionId": regex },
        { "metadata.targetUserId": regex },
        { "metadata.senderWallet": regex },
        { "metadata.receiverWallet": regex },
      ];
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
        search: search || null,
        user: user || null,
        role: role || null,
        ip: ip || null,
        from: rawFrom || null,
        to: rawTo || null,
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
