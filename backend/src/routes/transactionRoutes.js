import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { sendRemittance, getEthBalance } from "../blockchain/remittanceClient.js";
import { Transaction } from "../models/Transaction.js";
import { Wallet } from "../models/Wallet.js";
import { getUsdPerEthRate, convertEthToUsd } from "../utils/fiat.js";
import { logAudit } from "../utils/audit.js";

export const transactionRouter = express.Router();

// POST /api/transactions/send
transactionRouter.post("/send", protect, async (req, res, next) => {
  let txDoc;

  try {
    const { receiverWallet, amountEth } = req.body;

    if (!receiverWallet || !amountEth) {
      res.status(400);
      throw new Error("receiverWallet and amountEth are required.");
    }

    const walletDoc = await Wallet.findOne({ userId: req.user._id });
    if (!walletDoc || !walletDoc.isVerified) {
      res.status(400);
      throw new Error("You must link and verify a wallet before sending.");
    }

    // Create DB record first with pending status
    txDoc = await Transaction.create({
      senderUserId: req.user._id,
      senderWallet: walletDoc.address,
      receiverWallet,
      amount: Number(amountEth),
      status: "pending",
    });

    // Call blockchain
    const result = await sendRemittance(receiverWallet, amountEth);

    // Update DB with success and tx hash
    txDoc.status = "success";
    txDoc.txHash = result.txHash;
    await txDoc.save();

    try {
      await logAudit({
        user: req.user,
        action: "SEND_REMITTANCE",
        metadata: {
          txId: txDoc._id.toString(),
          amountEth,
          senderWallet: walletDoc.address,
          receiverWallet,
          txHash: result.txHash,
        },
        req,
      });
    } catch (err) {
      console.error("Failed to write SEND_REMITTANCE audit log:", err.message);
    }

    res.status(201).json({
      ok: true,
      transaction: {
        id: txDoc._id,
        status: txDoc.status,
        txHash: txDoc.txHash,
      },
    });
  } catch (err) {
    // If blockchain call failed, mark the transaction as failed
    if (txDoc) {
      txDoc.status = "failed";
      await txDoc.save().catch(() => {});
    }
    next(err);
  }
});

// GET /api/transactions/balance?wallet=0x...
transactionRouter.get("/balance", protect, async (req, res, next) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      res.status(400);
      throw new Error("wallet query parameter is required");
    }

    const balance = await getEthBalance(wallet);

    res.json({
      ok: true,
      wallet,
      balance,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/transactions/my
transactionRouter.get("/my", protect, async (req, res, next) => {
  try {
    const {
      status,
      from,
      to,
      view = "all",
      page = "1",
      limit = "10",
    } = req.query;

    const numericLimit = Math.min(parseInt(limit, 10) || 10, 50);
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);

    const userIdStr = req.user._id.toString();

    // Direction filter
    let query;
    if (view === "sent") {
      query = { senderUserId: req.user._id };
    } else if (view === "received") {
      query = { receiverUserId: req.user._id };
    } else {
      query = {
        $or: [{ senderUserId: req.user._id }, { receiverUserId: req.user._id }],
      };
    }

    // Optional status filter
    const allowedStatuses = ["pending", "success", "failed"];
    if (status && allowedStatuses.includes(status)) {
      query.status = status;
    }

    // Optional date range filter
    if (from || to) {
      query.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate)) query.createdAt.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate)) {
          toDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = toDate;
        }
      }
    }

    // Try to load FX rate once (uses REM_RATE_USD_PER_ETH)
    let rateUsdPerEth = null;
    try {
      rateUsdPerEth = getUsdPerEthRate();
    } catch {
      rateUsdPerEth = null;
    }

    const [txs, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit)
        .lean(),
      Transaction.countDocuments(query),
    ]);

    const transactions = txs.map((t) => {
      const isSender =
        t.senderUserId &&
        t.senderUserId.toString &&
        t.senderUserId.toString() === userIdStr;

      const direction = isSender ? "sent" : "received";

      let fiatAmountUsd = null;
      if (rateUsdPerEth != null) {
        try {
          fiatAmountUsd = convertEthToUsd(t.amount, rateUsdPerEth);
        } catch {
          fiatAmountUsd = null;
        }
      }

      return {
        id: t._id,
        senderWallet: t.senderWallet,
        receiverWallet: t.receiverWallet,
        amount: t.amount,
        status: t.status,
        txHash: t.txHash || null,
        createdAt: t.createdAt,
        direction,
        fiatAmountUsd,
        fiatCurrency: rateUsdPerEth ? "USD" : null,
        rateUsdPerEth,
      };
    });

    res.json({
      ok: true,
      total,
      page: numericPage,
      limit: numericLimit,
      transactions,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/transactions/:id
transactionRouter.get("/:id", protect, async (req, res, next) => {
  try {
    const { id } = req.params;

    const tx = await Transaction.findById(id).lean();
    if (!tx) {
      res.status(404);
      throw new Error("Transaction not found.");
    }

    const userId = req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    const involved =
      (tx.senderUserId && tx.senderUserId.toString() === userId) ||
      (tx.receiverUserId && tx.receiverUserId.toString() === userId);

    if (!isAdmin && !involved) {
      res.status(403);
      throw new Error("You are not allowed to view this transaction.");
    }

    let rateUsdPerEth = null;
    let fiatAmountUsd = null;
    try {
      rateUsdPerEth = getUsdPerEthRate();
      fiatAmountUsd = convertEthToUsd(tx.amount, rateUsdPerEth);
    } catch {
      rateUsdPerEth = null;
      fiatAmountUsd = null;
    }

    res.json({
      ok: true,
      transaction: {
        id: tx._id,
        senderWallet: tx.senderWallet,
        receiverWallet: tx.receiverWallet,
        amount: tx.amount,
        status: tx.status,
        txHash: tx.txHash || null,
        type: tx.type || null,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
        fiatAmountUsd,
        fiatCurrency: rateUsdPerEth ? "USD" : null,
        rateUsdPerEth,
      },
    });
  } catch (err) {
    next(err);
  }
});
