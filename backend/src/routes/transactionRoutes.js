import express from "express";
import crypto from "crypto";
import { protect } from "../middleware/authMiddleware.js";
import {
  sendRemittance,
  getEthBalance,
  getRemittanceClient,
} from "../blockchain/remittanceClient.js";
import { Transaction } from "../models/Transaction.js";
import { Wallet } from "../models/Wallet.js";
import { PaymentLink } from "../models/PaymentLink.js";
import { User } from "../models/User.js";
import { logAudit } from "../utils/audit.js";
import {
  requireAndConsumePaymentCode,
  sendPaymentVerificationCode,
} from "../utils/paymentVerification.js";
import {
  convertFromNativeCurrency,
  getAvailableCurrencySymbols,
  getNativeAssetSymbol,
  getUsdRateBySymbol,
  normalizeCurrencySymbol,
  getBalancesForSymbols,
} from "../utils/currency.js";

export const transactionRouter = express.Router();

const DEFAULT_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ASSET_SYMBOL = getNativeAssetSymbol();

function normalizeTransferAssetSymbol(rawSymbol) {
  const normalized = normalizeCurrencySymbol(rawSymbol);
  return normalized || DEFAULT_ASSET_SYMBOL;
}

function parseCurrencySymbols(rawValue) {
  const parsed = String(rawValue || "")
    .split(",")
    .map((value) => normalizeCurrencySymbol(value))
    .filter(Boolean);
  return [...new Set(parsed)];
}

function getFiatAmountUsd(amount, assetSymbol) {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
    return { fiatAmountUsd: null, fiatCurrency: null, rateUsdPerAsset: null };
  }

  const symbol = normalizeTransferAssetSymbol(assetSymbol);
  const rateUsdPerAsset = getUsdRateBySymbol(symbol);
  if (!Number.isFinite(rateUsdPerAsset) || rateUsdPerAsset <= 0) {
    return { fiatAmountUsd: null, fiatCurrency: null, rateUsdPerAsset: null };
  }

  return {
    fiatAmountUsd: normalizedAmount * rateUsdPerAsset,
    fiatCurrency: "USD",
    rateUsdPerAsset,
  };
}

function normalizeObjectId(value) {
  if (!value) return null;
  const normalized = String(
    typeof value === "object" && value !== null && value._id ? value._id : value
  ).trim();
  return normalized || null;
}

function getUserDisplayName(userDoc) {
  if (!userDoc) return null;
  const fullName = [userDoc.firstName, userDoc.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fullName) return fullName;
  const username = String(userDoc.username || "").trim();
  return username || null;
}

async function loadUsersById(userIds = []) {
  const uniqueIds = [...new Set(userIds.map(normalizeObjectId).filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const users = await User.find({ _id: { $in: uniqueIds } })
    .select("username firstName lastName")
    .lean();

  const userMap = new Map();
  users.forEach((userDoc) => {
    userMap.set(String(userDoc._id), userDoc);
  });
  return userMap;
}

function hashLinkToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function isLinkExpired(linkDoc) {
  return new Date(linkDoc.expiresAt).getTime() <= Date.now();
}

async function markLinkAsExpired(linkDoc) {
  if (!linkDoc || linkDoc.status === "expired") return;
  linkDoc.status = "expired";
  await linkDoc.save();
}

transactionRouter.post("/send-code", protect, async (req, res, next) => {
  try {
    const delivery = await sendPaymentVerificationCode({
      user: req.user,
      verificationChannel: req.body?.verificationChannel,
    });

    try {
      await logAudit({
        user: req.user,
        action: "PAYMENT_CODE_SENT",
        metadata: {
          channel: delivery.channel,
        },
        req,
      });
    } catch (auditErr) {
      console.error("Failed to write PAYMENT_CODE_SENT audit log:", auditErr.message);
    }

    res.json({
      ok: true,
      verificationChannel: delivery.channel,
      destination: delivery.destination,
      expiresInSeconds: delivery.expiresInSeconds,
    });
  } catch (err) {
    if (err?.statusCode) {
      res.status(err.statusCode);
    }
    next(err);
  }
});

// POST /api/transactions/link
transactionRouter.post("/link", protect, async (req, res, next) => {
  try {
    const amountNumber = Number(req.body?.amountEth);
    const note = String(req.body?.note || "").trim();
    const assetSymbol = normalizeTransferAssetSymbol(req.body?.assetSymbol);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      res.status(400);
      throw new Error("amountEth must be a positive number.");
    }

    if (assetSymbol !== DEFAULT_ASSET_SYMBOL) {
      res.status(400);
      throw new Error(`Only ${DEFAULT_ASSET_SYMBOL} transfers are currently supported.`);
    }

    if (note.length > 280) {
      res.status(400);
      throw new Error("note cannot exceed 280 characters.");
    }

    const walletDoc = await Wallet.findOne({
      userId: req.user._id,
      isVerified: true,
    })
      .select("address")
      .lean();

    if (!walletDoc?.address) {
      res.status(400);
      throw new Error(
        "You must link and verify a wallet before creating a transfer link."
      );
    }

    const availableBalance = await getEthBalance(walletDoc.address);
    if (amountNumber > availableBalance) {
      res.status(400);
      throw new Error(
        `Insufficient balance. Available: ${availableBalance.toFixed(4)} ${DEFAULT_ASSET_SYMBOL}.`
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashLinkToken(token);
    const expiresAt = new Date(Date.now() + DEFAULT_LINK_TTL_MS);

    await PaymentLink.create({
      creatorUserId: req.user._id,
      tokenHash,
      amount: amountNumber,
      assetSymbol,
      note: note || undefined,
      expiresAt,
    });

    res.status(201).json({
      ok: true,
      linkToken: token,
      amount: amountNumber,
      assetSymbol,
      note: note || null,
      expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/transactions/link/resolve?token=...
transactionRouter.get("/link/resolve", async (req, res, next) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) {
      res.status(400);
      throw new Error("token is required.");
    }

    const tokenHash = hashLinkToken(token);
    const linkDoc = await PaymentLink.findOne({ tokenHash }).lean();
    if (!linkDoc) {
      res.status(404);
      throw new Error("Transfer link not found.");
    }

    if (linkDoc.status === "expired" || isLinkExpired(linkDoc)) {
      if (linkDoc.status !== "expired") {
        await PaymentLink.updateOne(
          { _id: linkDoc._id, status: { $ne: "claimed" } },
          { $set: { status: "expired" } }
        );
      }
      return res.json({
        ok: true,
        status: "expired",
      });
    }

    if (linkDoc.status === "claimed") {
      return res.json({
        ok: true,
        status: "claimed",
        claimedAt: linkDoc.claimedAt || null,
      });
    }

    const creator = await User.findById(linkDoc.creatorUserId)
      .select("username firstName lastName")
      .lean();

    const creatorDisplayName =
      [creator?.firstName, creator?.lastName].filter(Boolean).join(" ").trim() ||
      creator?.username ||
      "User";

    res.json({
      ok: true,
      status: "active",
      amount: linkDoc.amount,
      assetSymbol: normalizeTransferAssetSymbol(linkDoc.assetSymbol),
      note: linkDoc.note || null,
      expiresAt: linkDoc.expiresAt,
      creator: {
        username: creator?.username || null,
        displayName: creatorDisplayName,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/transactions/link/claim
transactionRouter.post("/link/claim", protect, async (req, res, next) => {
  let linkDoc;
  let txDoc;

  try {
    const token = String(req.body?.token || "").trim();
    if (!token) {
      res.status(400);
      throw new Error("token is required.");
    }

    const receiverWalletDoc = await Wallet.findOne({
      userId: req.user._id,
      isVerified: true,
    })
      .select("address")
      .lean();

    if (!receiverWalletDoc) {
      res.status(400);
      throw new Error("You must link and verify a wallet before claiming.");
    }

    const tokenHash = hashLinkToken(token);

    linkDoc = await PaymentLink.findOneAndUpdate(
      { tokenHash, status: "active" },
      { $set: { status: "claiming" } },
      { new: true }
    );

    if (!linkDoc) {
      const existing = await PaymentLink.findOne({ tokenHash }).lean();

      if (!existing) {
        res.status(404);
        throw new Error("Transfer link not found.");
      }

      if (existing.status === "claimed") {
        res.status(409);
        throw new Error("Transfer link has already been claimed.");
      }

      if (existing.status === "expired" || isLinkExpired(existing)) {
        if (existing.status !== "expired") {
          await PaymentLink.updateOne(
            { _id: existing._id, status: { $ne: "claimed" } },
            { $set: { status: "expired" } }
          );
        }
        res.status(410);
        throw new Error("Transfer link has expired.");
      }

      res.status(409);
      throw new Error("Transfer link is currently being claimed.");
    }

    if (isLinkExpired(linkDoc)) {
      await markLinkAsExpired(linkDoc);
      res.status(410);
      throw new Error("Transfer link has expired.");
    }

    if (String(linkDoc.creatorUserId) === String(req.user._id)) {
      linkDoc.status = "active";
      await linkDoc.save();
      res.status(400);
      throw new Error("You cannot claim your own transfer link.");
    }

    const creatorWalletDoc = await Wallet.findOne({
      userId: linkDoc.creatorUserId,
      isVerified: true,
    })
      .select("address")
      .lean();

    let senderWallet = creatorWalletDoc?.address || "";
    if (!senderWallet) {
      senderWallet = getRemittanceClient().wallet.address;
    }

    txDoc = await Transaction.create({
      senderUserId: linkDoc.creatorUserId,
      receiverUserId: req.user._id,
      senderWallet,
      receiverWallet: receiverWalletDoc.address,
      amount: linkDoc.amount,
      assetSymbol: normalizeTransferAssetSymbol(linkDoc.assetSymbol),
      status: "pending",
      type: "sent",
    });

    const result = await sendRemittance(receiverWalletDoc.address, linkDoc.amount);

    txDoc.status = "success";
    txDoc.txHash = result.txHash || null;
    await txDoc.save();

    linkDoc.status = "claimed";
    linkDoc.claimedByUserId = req.user._id;
    linkDoc.claimedAt = new Date();
    linkDoc.txHash = result.txHash || null;
    await linkDoc.save();

    res.status(201).json({
      ok: true,
      transaction: {
        id: txDoc._id,
        status: txDoc.status,
        txHash: txDoc.txHash,
        amount: txDoc.amount,
        assetSymbol: normalizeTransferAssetSymbol(txDoc.assetSymbol),
        receiverWallet: txDoc.receiverWallet,
      },
    });
  } catch (err) {
    if (txDoc && txDoc.status !== "success") {
      txDoc.status = "failed";
      await txDoc.save().catch(() => {});
    }

    if (linkDoc && linkDoc.status === "claiming") {
      if (isLinkExpired(linkDoc)) {
        await markLinkAsExpired(linkDoc).catch(() => {});
      } else {
        linkDoc.status = "active";
        await linkDoc.save().catch(() => {});
      }
    }

    next(err);
  }
});

// POST /api/transactions/send
transactionRouter.post("/send", protect, async (req, res, next) => {
  let txDoc;

  try {
    const { receiverWallet, amountEth, verificationCode } = req.body;
    const assetSymbol = normalizeTransferAssetSymbol(req.body?.assetSymbol);

    if (!receiverWallet || !amountEth) {
      res.status(400);
      throw new Error("receiverWallet and amountEth are required.");
    }

    if (assetSymbol !== DEFAULT_ASSET_SYMBOL) {
      res.status(400);
      throw new Error(`Only ${DEFAULT_ASSET_SYMBOL} transfers are currently supported.`);
    }

    const walletDoc = await Wallet.findOne({ userId: req.user._id });
    if (!walletDoc || !walletDoc.isVerified) {
      res.status(400);
      throw new Error("You must link and verify a wallet before sending.");
    }

    const amountNumber = Number(amountEth);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      res.status(400);
      throw new Error("amountEth must be a positive number.");
    }

    const availableBalance = await getEthBalance(walletDoc.address);
    if (amountNumber > availableBalance) {
      res.status(400);
      throw new Error(
        `Insufficient balance. Available: ${availableBalance.toFixed(4)} ${DEFAULT_ASSET_SYMBOL}.`
      );
    }

    try {
      await requireAndConsumePaymentCode({
        user: req.user,
        code: verificationCode,
      });
    } catch (codeErr) {
      res.status(codeErr?.statusCode || 400);
      throw codeErr;
    }

    const normalizedReceiverWallet = String(receiverWallet || "")
      .trim()
      .toLowerCase();

    let receiverUserId = null;
    if (normalizedReceiverWallet) {
      const receiverWalletDoc = await Wallet.findOne({
        address: normalizedReceiverWallet,
        isVerified: true,
      })
        .select("userId")
        .lean();

      receiverUserId = receiverWalletDoc?.userId || null;
    }

    // Create DB record first with pending status
    txDoc = await Transaction.create({
      senderUserId: req.user._id,
      receiverUserId: receiverUserId || undefined,
      senderWallet: walletDoc.address,
      receiverWallet: normalizedReceiverWallet,
      amount: amountNumber,
      assetSymbol,
      status: "pending",
      type: "sent",
    });

    // Call blockchain
    const result = await sendRemittance(normalizedReceiverWallet, amountNumber);

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
          amountEth: amountNumber,
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
        assetSymbol: normalizeTransferAssetSymbol(txDoc.assetSymbol),
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
    const requestedCurrency = normalizeCurrencySymbol(req.query.currency);
    const requestedCurrencies = parseCurrencySymbols(req.query.currencies);
    const availableCurrencies = getAvailableCurrencySymbols();

    if (!wallet) {
      res.status(400);
      throw new Error("wallet query parameter is required");
    }

    if (requestedCurrency && !availableCurrencies.includes(requestedCurrency)) {
      res.status(400);
      throw new Error(`Unsupported currency: ${requestedCurrency}`);
    }

    if (
      requestedCurrencies.some(
        (symbol) => !availableCurrencies.includes(symbol)
      )
    ) {
      res.status(400);
      throw new Error("One or more requested currencies are unsupported.");
    }

    const nativeBalance = await getEthBalance(wallet);
    const symbolsForBalances =
      requestedCurrencies.length > 0 ? requestedCurrencies : availableCurrencies;
    const { nativeCurrency, balances } = getBalancesForSymbols(
      nativeBalance,
      symbolsForBalances
    );

    const responseCurrency = requestedCurrency || nativeCurrency;
    let responseBalance = Number(balances[responseCurrency]);

    if (!Number.isFinite(responseBalance)) {
      const converted = convertFromNativeCurrency(nativeBalance, responseCurrency);
      if (!Number.isFinite(converted)) {
        res.status(400);
        throw new Error(`Unable to calculate balance for ${responseCurrency}.`);
      }
      responseBalance = converted;
    }

    res.json({
      ok: true,
      wallet,
      balance: responseBalance,
      currency: responseCurrency,
      nativeCurrency,
      balances,
      availableCurrencies,
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

    const [txs, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit)
        .lean(),
      Transaction.countDocuments(query),
    ]);

    const userLookup = await loadUsersById(
      txs.flatMap((txDoc) => [txDoc.senderUserId, txDoc.receiverUserId])
    );

    const transactions = txs.map((t) => {
      const senderUserId = normalizeObjectId(t.senderUserId);
      const receiverUserId = normalizeObjectId(t.receiverUserId);
      const senderUserDoc = senderUserId ? userLookup.get(senderUserId) : null;
      const receiverUserDoc = receiverUserId ? userLookup.get(receiverUserId) : null;
      const isSender = senderUserId === userIdStr;

      const direction = isSender ? "sent" : "received";
      const assetSymbol = normalizeTransferAssetSymbol(t.assetSymbol);
      const { fiatAmountUsd, fiatCurrency, rateUsdPerAsset } = getFiatAmountUsd(
        t.amount,
        assetSymbol
      );

      return {
        id: t._id,
        senderUserId,
        receiverUserId,
        senderUsername: senderUserDoc?.username || null,
        receiverUsername: receiverUserDoc?.username || null,
        senderDisplayName: getUserDisplayName(senderUserDoc),
        receiverDisplayName: getUserDisplayName(receiverUserDoc),
        senderWallet: t.senderWallet,
        receiverWallet: t.receiverWallet,
        amount: t.amount,
        assetSymbol,
        status: t.status,
        txHash: t.txHash || null,
        createdAt: t.createdAt,
        direction,
        fiatAmountUsd,
        fiatCurrency,
        rateUsdPerAsset,
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
    const senderUserId = normalizeObjectId(tx.senderUserId);
    const receiverUserId = normalizeObjectId(tx.receiverUserId);

    const involved =
      senderUserId === userId || receiverUserId === userId;

    if (!isAdmin && !involved) {
      res.status(403);
      throw new Error("You are not allowed to view this transaction.");
    }

    const userLookup = await loadUsersById([senderUserId, receiverUserId]);
    const senderUserDoc = senderUserId ? userLookup.get(senderUserId) : null;
    const receiverUserDoc = receiverUserId ? userLookup.get(receiverUserId) : null;

    const isSender = senderUserId === userId;
    const direction = involved ? (isSender ? "sent" : "received") : tx.type || null;

    const assetSymbol = normalizeTransferAssetSymbol(tx.assetSymbol);
    const { fiatAmountUsd, fiatCurrency, rateUsdPerAsset } = getFiatAmountUsd(
      tx.amount,
      assetSymbol
    );

    res.json({
      ok: true,
      transaction: {
        id: tx._id,
        senderUserId,
        receiverUserId,
        senderUsername: senderUserDoc?.username || null,
        receiverUsername: receiverUserDoc?.username || null,
        senderDisplayName: getUserDisplayName(senderUserDoc),
        receiverDisplayName: getUserDisplayName(receiverUserDoc),
        senderWallet: tx.senderWallet,
        receiverWallet: tx.receiverWallet,
        amount: tx.amount,
        assetSymbol,
        status: tx.status,
        txHash: tx.txHash || null,
        type: tx.type || null,
        direction,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
        fiatAmountUsd,
        fiatCurrency,
        rateUsdPerAsset,
      },
    });
  } catch (err) {
    next(err);
  }
});
