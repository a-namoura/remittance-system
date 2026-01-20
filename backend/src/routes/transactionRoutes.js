import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { sendRemittance } from "../blockchain/remittanceClient.js";
import { Transaction } from "../models/Transaction.js";
import { Wallet } from "../models/Wallet.js";
import { User } from "../models/User.js";

export const transactionRouter = express.Router();

// POST /api/transactions/send
transactionRouter.post("/send", protect, async (req, res, next) => {
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

    // 3) Create tx record as pending (using your schema)
    const txDoc = await Transaction.create({
      senderUserId: req.user._id,
      receiverUserId,
      senderWallet,
      receiverWallet,
      amount: Number(amountEth),
      status: "pending",
      type: "sent",
    });

    // 4) Send on-chain transaction
    const result = await sendRemittance(receiverWallet, amountEth);

    // Attempt to extract txHash from whatever your client returns
    const txHash =
      result?.txHash ||
      result?.hash ||
      result?.transactionHash ||
      result?.receipt?.transactionHash;

    // 5) Update record success
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
