import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { sendRemittance } from "../blockchain/remittanceClient.js";
import { Transaction } from "../models/Transaction.js";
import { Wallet } from "../models/Wallet.js";

export const transactionRouter = express.Router();

// POST /api/transactions/send
transactionRouter.post("/send", protect, async (req, res, next) => {
  try {
    const { receiver, amountEth } = req.body;

    if (!receiver || !amountEth) {
      res.status(400);
      throw new Error("receiver and amountEth are required");
    }

    // 1) Find sender wallet from DB (linked wallet)
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
    const receiverWallet = String(receiver).toLowerCase().trim();

    // 2) Create tx record as pending (using YOUR schema)
    const txDoc = await Transaction.create({
      senderUserId: req.user._id,
      senderWallet,
      receiverWallet,
      amount: Number(amountEth),
      status: "pending",
      type: "sent",
    });

    // 3) Send on-chain transaction
    const result = await sendRemittance(receiverWallet, amountEth);

    // Attempt to extract txHash from whatever your client returns
    const txHash =
      result?.txHash ||
      result?.hash ||
      result?.transactionHash ||
      result?.receipt?.transactionHash;

    // 4) Update record success
    txDoc.status = "success";
    if (txHash) txDoc.txHash = txHash;
    await txDoc.save();

    res.status(201).json({
      message: "Remittance transaction submitted",
      tx: {
        id: txDoc._id,
        senderWallet: txDoc.senderWallet,
        receiverWallet: txDoc.receiverWallet,
        amount: txDoc.amount,
        status: txDoc.status,
        txHash: txDoc.txHash || null,
        createdAt: txDoc.createdAt,
      },
      chain: result,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/transactions/my?limit=10
transactionRouter.get("/my", protect, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);

    const txs = await Transaction.find({ senderUserId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      transactions: txs.map((t) => ({
        id: t._id,
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
