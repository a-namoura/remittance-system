import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { sendRemittance, getEthBalance } from "../blockchain/remittanceClient.js";
import { Transaction } from "../models/Transaction.js";
import { Wallet } from "../models/Wallet.js";
import { User } from "../models/User.js";
import { getUsdPerEthRate, convertEthToUsd } from "../utils/fiat.js";
import { logAudit } from "../utils/audit.js";

export const transactionRouter = express.Router();

// POST /api/transactions/send
transactionRouter.post("/send", protect, async (req, res, next) => {
  let txDoc;

  try {
    const { receiver, amountEth } = req.body;

    if (!receiver || !amountEth) {
      res.status(400);
      throw new Error("receiver and amountEth are required");
    }

    // 1) Find sender wallet from DB (linked + verified wallet)
    const senderWalletDoc = await Wallet.findOne({ userId: req.user._id }).lean();

    if (!senderWalletDoc?.address) {
      res.status(400);
      throw new Error("No linked wallet found. Please link your wallet first.");
    }

    if (!senderWalletDoc.isVerified) {
      res.status(400);
      throw new Error("Wallet is not verified. Please verify ownership first.");
    }

    const senderWallet = String(senderWalletDoc.address).toLowerCase().trim();

    // 2) Resolve receiver: wallet address OR registered user by email
    let receiverWallet;
    let receiverUserId = null;

    // If it looks like an EVM address (0x + 40 hex chars)
    if (receiver.startsWith("0x") && receiver.length === 42) {
      receiverWallet = receiver.toLowerCase().trim();
    } else {
      // Treat as email of a registered user
      const receiverUser = await User.findOne({ email: receiver }).lean();

      if (!receiverUser) {
        res.status(400);
        throw new Error("Recipient user not found.");
      }

      const receiverWalletDoc = await Wallet.findOne({
        userId: receiverUser._id,
        isVerified: true,
      }).lean();

      if (!receiverWalletDoc) {
        res.status(400);
        throw new Error("Recipient does not have a verified wallet.");
      }

      receiverWallet = String(receiverWalletDoc.address).toLowerCase().trim();
      receiverUserId = receiverUser._id;
    }

    // 2.5) Check sender balance before sending
    const senderBalance = await getEthBalance(senderWallet);

    if (Number(amountEth) <= 0) {
      res.status(400);
      throw new Error("Amount must be greater than zero.");
    }

    if (senderBalance < Number(amountEth)) {
      res.status(400);
      throw new Error(
        `Insufficient funds. Available: ${senderBalance} (on BSC testnet).`
      );
    }

    // 3) Create tx record as pending (using your schema)
    txDoc = await Transaction.create({
      senderUserId: req.user._id,
      receiverUserId,
      senderWallet,
      receiverWallet,
      amount: Number(amountEth),
      status: "pending",
      type: "sent",
    });

    // 4) Send on-chain transaction (with safe error handling)
    let chainResult;
    try {
      chainResult = await sendRemittance(receiverWallet, amountEth);

      const txHash =
        chainResult?.txHash ||
        chainResult?.hash ||
        chainResult?.transactionHash;

      if (!txHash) {
        throw new Error("Blockchain transaction did not return a hash.");
      }

      txDoc.status = "success";
      txDoc.txHash = txHash;
      await txDoc.save();

      // 5) Fiat conversion (best-effort)
      let rateUsdPerEth = null;
      let fiatAmountUsd = null;
      try {
        rateUsdPerEth = getUsdPerEthRate();
        fiatAmountUsd = convertEthToUsd(txDoc.amount, rateUsdPerEth);
      } catch {
        // if fx config missing, leave them null – don't break the tx
      }

      await logAudit({
        user: req.user,
        action: "SEND_REMITTANCE",
        metadata: {
          amountEth: txDoc.amount,
          receiverWallet: txDoc.receiverWallet,
          receiverUserId: receiverUserId || null,
          txHash: txDoc.txHash || null,
        },
        req,
      });

      return res.status(201).json({
        message: "Remittance transaction submitted",
        tx: {
          id: txDoc._id,
          senderWallet: txDoc.senderWallet,
          receiverWallet: txDoc.receiverWallet,
          amount: txDoc.amount,
          status: txDoc.status,
          txHash: txDoc.txHash || null,
          createdAt: txDoc.createdAt,
          fiatAmountUsd,
          fiatCurrency: rateUsdPerEth ? "USD" : null,
          rateUsdPerEth,
        },
        chain: chainResult,
      });
    } catch (chainError) {
      if (txDoc) {
        txDoc.status = "failed";
        await txDoc.save();
      }

      await logAudit({
        user: req.user,
        action: "SEND_REMITTANCE_FAILED",
        metadata: {
          receiver,
          amountEth,
          error: chainError.message,
        },
        req,
      });

      res.status(500);
      throw new Error(chainError.message || "Blockchain transaction failed.");
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/transactions/my?limit=&page=&status=&from=&to=
transactionRouter.get("/my", protect, async (req, res, next) => {
  try {
    const {
      status,
      from,
      to,
      page = "1",
      limit = "10",
    } = req.query;

    const numericLimit = Math.min(parseInt(limit, 10) || 10, 50);
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);

    const query = { senderUserId: req.user._id };

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

    // Try to load FX rate once
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

    res.json({
      ok: true,
      total,
      page: numericPage,
      limit: numericLimit,
      transactions: txs.map((t) => {
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
          receiverWallet: t.receiverWallet,
          amount: t.amount,
          status: t.status,
          txHash: t.txHash || null,
          createdAt: t.createdAt,
          fiatAmountUsd,
          fiatCurrency: rateUsdPerEth ? "USD" : null,
          rateUsdPerEth,
        };
      }),
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

    // Optional fiat conversion, like in /my
    let rateUsdPerEth = null;
    let fiatAmountUsd = null;

    try {
      rateUsdPerEth = getUsdPerEthRate();
      fiatAmountUsd = convertEthToUsd(tx.amount, rateUsdPerEth);
    } catch {
      // FX not configured – keep fiat fields null
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
