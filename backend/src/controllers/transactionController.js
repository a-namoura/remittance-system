import { Transaction } from "../models/Transaction.js";
import { Wallet } from "../models/Wallet.js";
import {
  getEthBalance,
  sendRemittance,
} from "../blockchain/remittanceClient.js";
import {
  createInvalidWalletAddressMessage,
  normalizeEvmAddress,
} from "../utils/walletAddress.js";

const DEFAULT_ASSET_SYMBOL = String(process.env.REM_NATIVE_CURRENCY || "ETH")
  .trim()
  .toUpperCase();

function parsePositiveLimit(value, defaultValue = 10) {
  if (value == null || value === "") return defaultValue;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 50) {
    const error = new Error("limit must be an integer between 1 and 50.");
    error.statusCode = 400;
    throw error;
  }
  return numeric;
}

// POST /api/transactions/send
// body: { receiver, amountEth }
export async function sendTransaction(req, res, next) {
  let txDoc = null;

  try {
    const rawReceiver = String(req.body?.receiver || "").trim();
    const amountNumber = Number(req.body?.amountEth);

    if (!rawReceiver || !req.body?.amountEth) {
      res.status(400);
      throw new Error("receiver and amountEth are required.");
    }

    const receiver = normalizeEvmAddress(rawReceiver);
    if (!receiver) {
      res.status(400);
      throw new Error(createInvalidWalletAddressMessage("receiver"));
    }

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      res.status(400);
      throw new Error("amountEth must be a positive number.");
    }

    const walletDoc = await Wallet.findOne({
      userId: req.user._id,
      isVerified: true,
    })
      .select("address")
      .lean();

    if (!walletDoc?.address) {
      res.status(400);
      throw new Error("You must link and verify a wallet before sending.");
    }
    const senderWallet = normalizeEvmAddress(walletDoc.address);
    if (!senderWallet) {
      res.status(400);
      throw new Error(createInvalidWalletAddressMessage("linked wallet address"));
    }

    const availableBalance = await getEthBalance(senderWallet);
    if (amountNumber > availableBalance) {
      res.status(400);
      throw new Error(
        `Insufficient balance. Available: ${availableBalance.toFixed(4)} ${DEFAULT_ASSET_SYMBOL}.`
      );
    }

    txDoc = await Transaction.create({
      senderUserId: req.user._id,
      senderWallet,
      receiverWallet: receiver,
      amount: amountNumber,
      assetSymbol: DEFAULT_ASSET_SYMBOL,
      status: "pending",
      type: "sent",
    });

    const result = await sendRemittance(receiver, amountNumber);

    txDoc.status = "success";
    txDoc.txHash = result?.txHash || null;
    await txDoc.save();

    return res.json({
      ok: true,
      transaction: {
        id: txDoc._id,
        receiverWallet: txDoc.receiverWallet,
        amount: txDoc.amount,
        assetSymbol: txDoc.assetSymbol,
        status: txDoc.status,
        txHash: txDoc.txHash || null,
        createdAt: txDoc.createdAt,
      },
    });
  } catch (err) {
    if (txDoc && txDoc.status !== "success") {
      txDoc.status = "failed";
      await txDoc.save().catch(() => {});
    }
    if (err?.statusCode) res.status(err.statusCode);
    next(err);
  }
}

// GET /api/transactions/my?limit=10
export async function getMyTransactions(req, res, next) {
  try {
    const limit = parsePositiveLimit(req.query.limit, 10);

    const txs = await Transaction.find({
      $or: [{ senderUserId: req.user._id }, { receiverUserId: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      ok: true,
      transactions: txs.map((t) => ({
        id: t._id,
        receiverWallet: t.receiverWallet,
        senderWallet: t.senderWallet,
        amount: t.amount,
        assetSymbol: t.assetSymbol || DEFAULT_ASSET_SYMBOL,
        status: t.status,
        txHash: t.txHash || null,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    if (err?.statusCode) res.status(err.statusCode);
    next(err);
  }
}
