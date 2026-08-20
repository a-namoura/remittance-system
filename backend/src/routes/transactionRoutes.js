import express from "express";
import crypto from "crypto";
import { protect } from "../middleware/authMiddleware.js";
import { allowBodyFields, allowQueryFields } from "../middleware/allowFields.js";
import {
  getEthBalance,
  getUserRemittanceSubmission,
  submitRemittance,
} from "../blockchain/remittanceClient.js";
import { Transaction } from "../models/Transaction.js";
import { IdempotencyRecord } from "../models/IdempotencyRecord.js";
import { Wallet } from "../models/Wallet.js";
import { PaymentLink } from "../models/PaymentLink.js";
import { PaymentRequestLink } from "../models/PaymentRequestLink.js";
import { User } from "../models/User.js";
import {
  logAudit,
  logTransferAttempt,
  logTransferResult,
} from "../utils/audit.js";
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
import {
  createInvalidWalletAddressMessage,
  normalizeEvmAddress,
} from "../utils/walletAddress.js";
import {
  createTransferRequestKey,
  DUPLICATE_TRANSFER_REQUEST_MESSAGE,
  IN_FLIGHT_TRANSACTION_STATUSES,
  isDuplicateTransferRequestKeyError,
  markTransactionFailedAndLogSyncError,
  recordTransactionSubmission,
  settleTransactionAfterSubmission,
} from "../utils/transactionRequests.js";
import {
  rejectInvalidTransferAmount,
  rejectOutOfRangeTransferAmount,
} from "../utils/transferLimits.js";
import { updateStoredWalletBalance } from "../utils/walletBalances.js";
import {
  acquireIdempotency,
  completeIdempotency,
  hashIdempotencyRequest,
  readIdempotencyKey,
  releaseIdempotency,
} from "../utils/idempotency.js";
import { addLogContext } from "../utils/logging.js";
import { incrementMetric } from "../utils/metrics.js";

export const transactionRouter = express.Router();

const DEFAULT_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ASSET_SYMBOL = getNativeAssetSymbol();
export const MY_TRANSACTION_STATUSES = Object.freeze([
  "pending",
  "success",
  "failed",
  "cancelled",
]);
export const MY_TRANSACTION_VIEWS = Object.freeze(["all", "sent", "received"]);

function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(value.slice(0, 4)) &&
    date.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getUTCDate() === Number(value.slice(8, 10))
  );
}

export function getEndOfUtcDay(value) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function isPositiveInteger(value) {
  return (
    typeof value === "string" &&
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  );
}

export function validateMyTransactionsQuery({ status, view, from, to, page, limit } = {}) {
  if (status !== undefined && !MY_TRANSACTION_STATUSES.includes(status)) {
    const error = new Error("Invalid status query value.");
    error.statusCode = 400;
    throw error;
  }

  if (view !== undefined && !MY_TRANSACTION_VIEWS.includes(view)) {
    const error = new Error("Invalid view query value.");
    error.statusCode = 400;
    throw error;
  }

  if (from !== undefined && !isValidIsoDate(from)) {
    const error = new Error("Invalid from query value. Expected a YYYY-MM-DD date.");
    error.statusCode = 400;
    throw error;
  }

  if (to !== undefined && !isValidIsoDate(to)) {
    const error = new Error("Invalid to query value. Expected a YYYY-MM-DD date.");
    error.statusCode = 400;
    throw error;
  }

  if (from !== undefined && to !== undefined && from > to) {
    const error = new Error("Invalid date range: from must be on or before to.");
    error.statusCode = 400;
    throw error;
  }

  if (page !== undefined && !isPositiveInteger(page)) {
    const error = new Error("Invalid page query value. Expected a positive integer.");
    error.statusCode = 400;
    throw error;
  }

  if (limit !== undefined && !isPositiveInteger(limit)) {
    const error = new Error("Invalid limit query value. Expected a positive integer.");
    error.statusCode = 400;
    throw error;
  }

  if (limit !== undefined && Number(limit) > 50) {
    const error = new Error("Invalid limit query value. Maximum is 50.");
    error.statusCode = 400;
    throw error;
  }
}

function requireRouteEvmAddress(res, value, fieldName) {
  const normalizedAddress = normalizeEvmAddress(value);
  if (!normalizedAddress) {
    res.status(400);
    throw new Error(createInvalidWalletAddressMessage(fieldName));
  }
  return normalizedAddress;
}

function rejectSelfTransfer(res, senderWallet, receiverWallet) {
  if (senderWallet === receiverWallet) {
    res.status(400);
    throw new Error("You cannot transfer funds to your own wallet address.");
  }
}

function normalizeTransferAssetSymbol(rawSymbol) {
  const normalized = normalizeCurrencySymbol(rawSymbol);
  if (normalized === "E" + "TH" && DEFAULT_ASSET_SYMBOL === "BNB") {
    return DEFAULT_ASSET_SYMBOL;
  }
  return normalized || DEFAULT_ASSET_SYMBOL;
}

async function rejectInFlightDuplicateTransfer(res, transferRequestKey, req) {
  const duplicate = await Transaction.exists({
    transferRequestKey,
    status: { $in: IN_FLIGHT_TRANSACTION_STATUSES },
  });

  if (duplicate) {
    await logAudit({
      user: req?.user,
      action: "DUPLICATE_TRANSFER_FAILED",
      metadata: { resourceHash: crypto.createHash("sha256").update(String(transferRequestKey)).digest("hex") },
      req,
    });
    res.status(409);
    throw new Error(DUPLICATE_TRANSFER_REQUEST_MESSAGE);
  }
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

async function rejectInsufficientNativeBalance(res, walletAddress, amount) {
  const normalizedAmount = Number(amount);
  const balance = await getEthBalance(walletAddress);
  await updateStoredWalletBalance(walletAddress, balance);

  if (
    !Number.isFinite(balance) ||
    !Number.isFinite(normalizedAmount) ||
    normalizedAmount > balance
  ) {
    res.status(400);
    throw new Error(
      `Insufficient balance. Available: ${Number.isFinite(balance) ? balance.toFixed(4) : "0.0000"} ${DEFAULT_ASSET_SYMBOL}.`
    );
  }

  return balance;
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

function hashPurposeBoundLinkToken(purpose, token) {
  return crypto
    .createHash("sha256")
    .update(`${purpose}:${String(token)}`)
    .digest("hex");
}

function canonicalRequestPayment({ receiverWallet, amount, assetSymbol }) {
  return [
    String(receiverWallet || "").trim().toLowerCase(),
    String(Number(amount)),
    String(assetSymbol || "").trim().toUpperCase(),
  ].join("|");
}

function hashRequestPayment(payment) {
  return crypto.createHash("sha256").update(canonicalRequestPayment(payment)).digest("hex");
}

function verifyRequestPaymentCommitment(commitment, commitmentKey, payment) {
  try {
    const expected = Buffer.from(String(commitment || ""), "base64url");
    const actual = crypto
      .createHmac("sha256", Buffer.from(String(commitmentKey || ""), "base64url"))
      .update(canonicalRequestPayment(payment))
      .digest();
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function isLinkExpired(linkDoc) {
  return new Date(linkDoc.expiresAt).getTime() <= Date.now();
}

async function markLinkAsExpired(linkDoc) {
  if (!linkDoc || linkDoc.status === "expired") return;
  linkDoc.status = "expired";
  await linkDoc.save();
}

transactionRouter.post(
  "/send-code",
  protect,
  allowQueryFields([]),
  allowBodyFields(["verificationChannel"]),
  async (req, res, next) => {
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
  }
);

// Request links use their own purpose-bound token namespace and collection.
// They never put a username or wallet address in the shared URL.
transactionRouter.post(
  "/request-link",
  protect,
  allowQueryFields([]),
  allowBodyFields(["encryptedPayload", "paymentCommitment", "assetSymbol"]),
  async (req, res, next) => {
    try {
      const encryptedPayload = String(req.body?.encryptedPayload || "").trim();
      const paymentCommitment = String(req.body?.paymentCommitment || "").trim();
      const assetSymbol = normalizeTransferAssetSymbol(req.body?.assetSymbol);
      if (!encryptedPayload || encryptedPayload.length > 8192) {
        res.status(400);
        throw new Error("A valid encrypted request payload is required.");
      }
      if (!/^[A-Za-z0-9_-]{43}$/.test(paymentCommitment)) {
        res.status(400);
        throw new Error("A valid payment commitment is required.");
      }

      const walletDoc = await Wallet.findOne({
        userId: req.user._id,
        isVerified: true,
      })
        .select("address")
        .lean();
      if (!walletDoc?.address) {
        res.status(400);
        throw new Error("You must link and verify a wallet before creating a request link.");
      }

      const token = `req_${crypto.randomBytes(32).toString("hex")}`;
      const expiresAt = new Date(Date.now() + DEFAULT_LINK_TTL_MS);
      await PaymentRequestLink.create({
        requesterUserId: req.user._id,
        tokenHash: hashPurposeBoundLinkToken("request", token),
        encryptedPayload,
        paymentCommitment,
        assetSymbol,
        expiresAt,
      });

      res.status(201).json({ ok: true, requestToken: token, expiresAt });
    } catch (err) {
      next(err);
    }
  }
);

transactionRouter.post(
  "/request-link/resolve",
  protect,
  allowQueryFields([]),
  allowBodyFields(["token", "commitmentKey", "receiverWallet", "amountEth", "assetSymbol"]),
  async (req, res, next) => {
    try {
      const token = String(req.body?.token || "").trim();
      const commitmentKey = String(req.body?.commitmentKey || "").trim();
      const payment = {
        receiverWallet: requireRouteEvmAddress(res, req.body?.receiverWallet, "receiverWallet"),
        amount: Number(req.body?.amountEth),
        assetSymbol: normalizeTransferAssetSymbol(req.body?.assetSymbol),
      };
      rejectInvalidTransferAmount(res, payment.amount);
      rejectOutOfRangeTransferAmount(res, payment.amount);
      if (!token || !token.startsWith("req_")) {
        res.status(400);
        throw new Error("A valid request token is required.");
      }

      const linkDoc = await PaymentRequestLink.findOne({
        tokenHash: hashPurposeBoundLinkToken("request", token),
      }).lean();
      if (!linkDoc || linkDoc.status === "expired" || isLinkExpired(linkDoc)) {
        if (linkDoc && linkDoc.status === "active") {
          await PaymentRequestLink.updateOne({ _id: linkDoc._id, status: "active" }, { $set: { status: "expired" } });
        }
        res.status(410);
        throw new Error("Payment request link is invalid or expired.");
      }
      if (linkDoc.status !== "active") {
        return res.json({ ok: true, status: linkDoc.status, expiresAt: linkDoc.expiresAt });
      }

      res.json({
        ok: true,
        status: linkDoc.status,
        encryptedPayload: linkDoc.encryptedPayload,
        assetSymbol: linkDoc.assetSymbol || DEFAULT_ASSET_SYMBOL,
        expiresAt: linkDoc.expiresAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

transactionRouter.post(
  "/request-link/revoke",
  protect,
  allowQueryFields([]),
  allowBodyFields(["token"]),
  async (req, res, next) => {
    try {
      const token = String(req.body?.token || "").trim();
      if (!token.startsWith("req_")) {
        res.status(400);
        throw new Error("A valid request token is required.");
      }
      const linkDoc = await PaymentRequestLink.findOneAndUpdate(
        {
          requesterUserId: req.user._id,
          tokenHash: hashPurposeBoundLinkToken("request", token),
          status: "active",
        },
        { $set: { status: "revoked", revokedAt: new Date() } },
        { returnDocument: "after" }
      );
      if (!linkDoc) {
        res.status(404);
        throw new Error("Active payment request link not found.");
      }
      res.json({ ok: true, status: "revoked" });
    } catch (err) {
      next(err);
    }
  }
);

transactionRouter.post(
  "/request-link/reserve",
  protect,
  allowQueryFields([]),
  allowBodyFields(["token"]),
  async (req, res, next) => {
    try {
      const token = String(req.body?.token || "").trim();
      if (!token.startsWith("req_")) {
        res.status(400);
        throw new Error("A valid request token is required.");
      }
      const tokenHash = hashPurposeBoundLinkToken("request", token);
      const candidate = await PaymentRequestLink.findOne({ tokenHash }).select("paymentCommitment").lean();
      if (!candidate || (candidate.paymentCommitment && !verifyRequestPaymentCommitment(candidate.paymentCommitment, commitmentKey, payment))) {
        res.status(400);
        throw new Error("Payment details do not match the encrypted request.");
      }
      const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
      const linkDoc = await PaymentRequestLink.findOneAndUpdate(
        {
          tokenHash,
          expiresAt: { $gt: new Date() },
          $or: [
            { status: "active" },
            { status: "claiming", claimingAt: { $lte: staleBefore } },
            { status: "claiming", paidByUserId: req.user._id },
          ],
        },
        { $set: { status: "claiming", claimingAt: new Date(), paidByUserId: req.user._id, reservedPaymentHash: hashRequestPayment(payment) } },
        { returnDocument: "after" }
      );
      if (!linkDoc) {
        res.status(409);
        throw new Error("Payment request is expired, revoked, paid, or reserved by another payer.");
      }
      res.json({ ok: true, status: "claiming" });
    } catch (err) {
      next(err);
    }
  }
);

transactionRouter.post(
  "/request-link/release",
  protect,
  allowQueryFields([]),
  allowBodyFields(["token"]),
  async (req, res, next) => {
    try {
      const token = String(req.body?.token || "").trim();
      await PaymentRequestLink.updateOne(
        {
          tokenHash: hashPurposeBoundLinkToken("request", token),
          status: "claiming",
          paidByUserId: req.user._id,
          transactionId: { $exists: false },
        },
        { $set: { status: "active" }, $unset: { paidByUserId: 1, claimingAt: 1, reservedPaymentHash: 1 } }
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/transactions/link
transactionRouter.post(
  "/link",
  protect,
  allowQueryFields([]),
  allowBodyFields(["amountEth", "note", "assetSymbol"]),
  async (req, res, next) => {
  try {
    const amountNumber = Number(req.body?.amountEth);
    const note = String(req.body?.note || "").trim();
    const assetSymbol = normalizeTransferAssetSymbol(req.body?.assetSymbol);

    rejectInvalidTransferAmount(res, amountNumber);
    rejectOutOfRangeTransferAmount(res, amountNumber);

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

    const senderWallet = requireRouteEvmAddress(
      res,
      walletDoc.address,
      "linked wallet address"
    );
    await rejectInsufficientNativeBalance(res, senderWallet, amountNumber);

    const token = `snd_${crypto.randomBytes(32).toString("hex")}`;
    const tokenHash = hashPurposeBoundLinkToken("send", token);
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
  }
);

// GET /api/transactions/link/resolve?token=...
transactionRouter.get(
  "/link/resolve",
  allowQueryFields(["token"]),
  allowBodyFields([]),
  async (req, res, next) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) {
      res.status(400);
      throw new Error("token is required.");
    }

    const tokenHash = token.startsWith("snd_")
      ? hashPurposeBoundLinkToken("send", token)
      : hashLinkToken(token);
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
        txHash: linkDoc.txHash || null,
      });
    }

    if (linkDoc.status === "claiming") {
      return res.json({
        ok: true,
        status: "claiming",
        amount: linkDoc.amount,
        assetSymbol: normalizeTransferAssetSymbol(linkDoc.assetSymbol),
        note: linkDoc.note || null,
        expiresAt: linkDoc.expiresAt,
        txHash: linkDoc.txHash || null,
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
  }
);

// POST /api/transactions/link/claim
transactionRouter.post(
  "/link/claim",
  protect,
  allowQueryFields([]),
  allowBodyFields(["token"]),
  async (req, res, next) => {
  let linkDoc;
  let txDoc;
  let transferResultLogged = false;
  let idempotencyRecord;

  try {
    const token = String(req.body?.token || "").trim();
    await logTransferAttempt({
      user: req.user,
      req,
      flow: "transfer_link_claim",
      metadata: { tokenProvided: Boolean(token) },
    });

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

    const receiverWallet = requireRouteEvmAddress(
      res,
      receiverWalletDoc.address,
      "receiverWallet"
    );

    const idempotency = await acquireIdempotency({
      model: IdempotencyRecord,
      userId: req.user._id,
      endpoint: "POST /api/transactions/link/claim",
      key: readIdempotencyKey(req),
      requestHash: hashIdempotencyRequest({ token, receiverWallet }),
    });
    if (idempotency.replay) {
      res.set("Idempotency-Replayed", "true");
      return res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
    }
    idempotencyRecord = idempotency.record;

    const tokenHash = token.startsWith("snd_")
      ? hashPurposeBoundLinkToken("send", token)
      : hashLinkToken(token);

    linkDoc = await PaymentLink.findOneAndUpdate(
      { tokenHash, status: "active" },
      { $set: { status: "claiming" } },
      { returnDocument: "after" }
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

    if (!creatorWalletDoc?.address) {
      res.status(409);
      throw new Error(
        "Transfer creator must have a verified connected wallet before this link can be claimed."
      );
    }

    const senderWallet = requireRouteEvmAddress(
      res,
      creatorWalletDoc.address,
      "senderWallet"
    );

    rejectSelfTransfer(res, senderWallet, receiverWallet);
    rejectOutOfRangeTransferAmount(res, linkDoc.amount);
    await rejectInsufficientNativeBalance(res, senderWallet, linkDoc.amount);

    txDoc = await Transaction.create({
      senderUserId: linkDoc.creatorUserId,
      receiverUserId: req.user._id,
      senderWallet,
      receiverWallet,
      amount: linkDoc.amount,
      assetSymbol: normalizeTransferAssetSymbol(linkDoc.assetSymbol),
      status: "pending",
      type: "sent",
      paymentLinkId: linkDoc._id,
    });
    addLogContext({ transactionId: String(txDoc._id) });
    incrementMetric("transactions_created_total", { flow: "transfer_link_claim", asset: txDoc.assetSymbol });

    const submission = await submitRemittance(receiverWallet, linkDoc.amount, {
      onSubmitted: (submission) =>
        recordTransactionSubmission(txDoc, submission),
    });

    linkDoc.txHash = submission.txHash || null;
    await linkDoc.save();

    settleTransactionAfterSubmission({
      txDoc,
      submission,
      onSuccess: async ({ result }) => {
        await logTransferResult({
          user: req.user,
          req,
          flow: "transfer_link_claim",
          transaction: txDoc,
          metadata: {
            senderWallet,
            receiverWallet,
            amount: linkDoc.amount,
          },
        });

        await PaymentLink.findOneAndUpdate(
          { _id: linkDoc._id, status: "claiming" },
          {
            $set: {
              status: "claimed",
              claimedByUserId: req.user._id,
              claimedAt: new Date(),
              txHash: result.txHash || submission.txHash || null,
            },
          }
        );
      },
      onFailure: async ({ error }) => {
        await logTransferResult({
          user: req.user,
          req,
          flow: "transfer_link_claim",
          transaction: txDoc,
          error,
        });

        if (isLinkExpired(linkDoc)) {
          await PaymentLink.findOneAndUpdate(
            { _id: linkDoc._id, status: "claiming" },
            { $set: { status: "expired" } }
          );
          return;
        }

        await PaymentLink.findOneAndUpdate(
          { _id: linkDoc._id, status: "claiming" },
          {
            $set: { status: "active" },
            $unset: { txHash: "" },
          }
        );
      },
    });
    transferResultLogged = true;

    const responseBody = {
      ok: true,
      status: "claiming",
      message: "Transfer claim submitted. Confirmation is processing.",
      transaction: {
        id: txDoc._id,
        status: txDoc.status,
        txHash: txDoc.txHash || submission.txHash || null,
        failureReason: txDoc.failureReason || null,
        reconciliationError: txDoc.reconciliationError || null,
        blockchainResultReceivedAt: txDoc.blockchainResultReceivedAt || null,
        blockchainSyncedAt: txDoc.blockchainSyncedAt || null,
        blockchainSubmittedAt: txDoc.blockchainSubmittedAt || submission.submittedAt,
        amount: txDoc.amount,
        assetSymbol: normalizeTransferAssetSymbol(txDoc.assetSymbol),
        receiverWallet: txDoc.receiverWallet,
      },
    };
    await completeIdempotency({
      model: IdempotencyRecord,
      record: idempotencyRecord,
      statusCode: 202,
      responseBody,
      transactionId: txDoc._id,
    });
    res.status(202).json(responseBody);
  } catch (err) {
    if (idempotencyRecord && !txDoc) {
      await releaseIdempotency({ model: IdempotencyRecord, record: idempotencyRecord }).catch(() => {});
    }
    if (err?.retryAfter) res.set("Retry-After", String(err.retryAfter));
    if (txDoc && !["success", "failed"].includes(txDoc.status)) {
      await markTransactionFailedAndLogSyncError(txDoc, err);
    }

    if (!transferResultLogged) {
      await logTransferResult({
        user: req.user,
        req,
        flow: "transfer_link_claim",
        transaction: txDoc,
        error: err,
      });
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
  }
);

// POST /api/transactions/send
/**
 * Creates the direct-send route with replaceable boundary dependencies.
 * The default export wiring below intentionally uses the production services.
 */
export function createSendTransactionRouter({
  protectMiddleware = protect,
  verifyPaymentCode = requireAndConsumePaymentCode,
  submitRemittanceRpc = submitRemittance,
  adoptUserSubmission = getUserRemittanceSubmission,
  getNativeBalance = getEthBalance,
  updateWalletBalance = updateStoredWalletBalance,
  walletModel = Wallet,
  transactionModel = Transaction,
  requestLinkModel = PaymentRequestLink,
  logAttempt = logTransferAttempt,
  logResult = logTransferResult,
  createRequestKey = createTransferRequestKey,
  rejectInFlightTransfer = rejectInFlightDuplicateTransfer,
  recordSubmission = recordTransactionSubmission,
  settleSubmission = settleTransactionAfterSubmission,
  markFailed = markTransactionFailedAndLogSyncError,
  idempotencyModel = IdempotencyRecord,
} = {}) {
  const router = express.Router();
  const rejectInsufficientBalance = async (res, walletAddress, amount) => {
    const normalizedAmount = Number(amount);
    const balance = await getNativeBalance(walletAddress);
    await updateWalletBalance(walletAddress, balance);
    if (!Number.isFinite(balance) || !Number.isFinite(normalizedAmount) || normalizedAmount > balance) {
      res.status(400);
      throw new Error(`Insufficient balance. Available: ${Number.isFinite(balance) ? balance.toFixed(4) : "0.0000"} ${DEFAULT_ASSET_SYMBOL}.`);
    }
    return balance;
  };

  router.post(
  "/send",
  protectMiddleware,
  allowQueryFields([]),
  allowBodyFields(["receiverWallet", "amountEth", "verificationCode", "assetSymbol", "txHash", "requestToken", "commitmentKey"]),
  async (req, res, next) => {
  let txDoc;
  let requestLinkDoc;
  let transferResultLogged = false;
  let idempotencyRecord;

  try {
    const { receiverWallet, amountEth, verificationCode, txHash } = req.body;
    const requestToken = String(req.body?.requestToken || "").trim();
    const assetSymbol = normalizeTransferAssetSymbol(req.body?.assetSymbol);
    const idempotencyKey = readIdempotencyKey(req);

    await logAttempt({
      user: req.user,
      req,
      flow: "direct_send",
      metadata: {
        receiverWallet: String(receiverWallet || "").trim() || null,
        amount: Number.isFinite(Number(amountEth)) ? Number(amountEth) : null,
        assetSymbol,
      },
    });

    if (!receiverWallet || !amountEth) {
      res.status(400);
      throw new Error("receiverWallet and amountEth are required.");
    }

    if (assetSymbol !== DEFAULT_ASSET_SYMBOL) {
      res.status(400);
      throw new Error(`Only ${DEFAULT_ASSET_SYMBOL} transfers are currently supported.`);
    }

    const normalizedReceiverWallet = requireRouteEvmAddress(
      res,
      receiverWallet,
      "receiverWallet"
    );

    const walletDoc = await walletModel.findOne({ userId: req.user._id });
    if (!walletDoc || !walletDoc.isVerified) {
      res.status(400);
      throw new Error("You must link and verify a wallet before sending.");
    }
    const senderWallet = requireRouteEvmAddress(
      res,
      walletDoc.address,
      "linked wallet address"
    );
    rejectSelfTransfer(res, senderWallet, normalizedReceiverWallet);

    const amountNumber = Number(amountEth);
    rejectInvalidTransferAmount(res, amountNumber);
    rejectOutOfRangeTransferAmount(res, amountNumber);
    const idempotency = await acquireIdempotency({
      model: idempotencyModel,
      userId: req.user._id,
      endpoint: "POST /api/transactions/send",
      key: idempotencyKey,
      requestHash: hashIdempotencyRequest({
        senderWallet,
        receiverWallet: normalizedReceiverWallet,
        amount: amountNumber,
        assetSymbol,
        txHash: String(txHash || "").toLowerCase(),
        requestToken,
      }),
    });
    if (idempotency.replay) {
      res.set("Idempotency-Replayed", "true");
      return res.status(idempotency.replay.statusCode).json(idempotency.replay.body);
    }
    idempotencyRecord = idempotency.record;
    await rejectInsufficientBalance(res, senderWallet, amountNumber);

    const transferRequestKey = createRequestKey({
      senderUserId: req.user._id,
      senderWallet,
      receiverWallet: normalizedReceiverWallet,
      amount: amountNumber,
      assetSymbol,
    });
    await rejectInFlightTransfer(res, transferRequestKey, req);

    try {
      await verifyPaymentCode({
        user: req.user,
        code: verificationCode,
      });
    } catch (codeErr) {
      res.status(codeErr?.statusCode || 400);
      throw codeErr;
    }

    if (!txHash && submitRemittanceRpc === submitRemittance) {
      res.status(400);
      throw new Error("Sign and submit this payment with your linked wallet first.");
    }

    if (requestToken) {
      if (!requestToken.startsWith("req_")) {
        res.status(400);
        throw new Error("Invalid payment request token.");
      }
      requestLinkDoc = await requestLinkModel.findOneAndUpdate(
        {
          tokenHash: hashPurposeBoundLinkToken("request", requestToken),
          status: "claiming",
          paidByUserId: req.user._id,
          reservedPaymentHash: hashRequestPayment({ receiverWallet: normalizedReceiverWallet, amount: amountNumber, assetSymbol }),
          expiresAt: { $gt: new Date() },
        },
        { $set: { claimingAt: new Date() } },
        { returnDocument: "after" }
      );
      if (!requestLinkDoc) {
        res.status(409);
        throw new Error("Payment request is expired, revoked, or already being paid.");
      }
    }

    let receiverUserId = null;
    if (normalizedReceiverWallet) {
      const receiverWalletDoc = await walletModel.findOne({
        address: normalizedReceiverWallet,
        isVerified: true,
      })
        .select("userId")
        .lean();

      receiverUserId = receiverWalletDoc?.userId || null;
    }

    // Create DB record first with pending status
    txDoc = await transactionModel.create({
      senderUserId: req.user._id,
      receiverUserId: receiverUserId || undefined,
      senderWallet,
      receiverWallet: normalizedReceiverWallet,
      amount: amountNumber,
      assetSymbol,
      status: "pending",
      type: "sent",
      transferRequestKey,
    });
    addLogContext({ transactionId: String(txDoc._id) });
    incrementMetric("transactions_created_total", { flow: "direct_send", asset: txDoc.assetSymbol });
    if (requestLinkDoc) {
      requestLinkDoc.transactionId = txDoc._id;
      await requestLinkDoc.save();
    }

    const submission = txHash
      ? await adoptUserSubmission(txHash, {
          sender: senderWallet,
          receiver: normalizedReceiverWallet,
          amountEth: amountNumber,
        })
      : await submitRemittanceRpc(normalizedReceiverWallet, amountNumber, {
          onSubmitted: (submission) => recordSubmission(txDoc, submission),
        });
    if (txHash) await recordSubmission(txDoc, submission);

    settleSubmission({
      txDoc,
      submission,
      onSuccess: async () => {
        if (requestLinkDoc) {
          await requestLinkModel.updateOne(
            { _id: requestLinkDoc._id, status: "claiming" },
            { $set: { status: "paid", paidAt: new Date(), transactionId: txDoc._id } }
          );
        }
        await logResult({
          user: req.user,
          req,
          flow: "direct_send",
          transaction: txDoc,
          metadata: {
            amount: amountNumber,
            assetSymbol,
            senderWallet,
            receiverWallet: normalizedReceiverWallet,
          },
        });
      },
      onFailure: async ({ error }) => {
        if (requestLinkDoc) {
          await requestLinkModel.updateOne(
            { _id: requestLinkDoc._id, status: "claiming" },
            {
              $set: { status: isLinkExpired(requestLinkDoc) ? "expired" : "active" },
              $unset: { paidByUserId: 1, transactionId: 1, claimingAt: 1, reservedPaymentHash: 1 },
            }
          );
        }
        await logResult({
          user: req.user,
          req,
          flow: "direct_send",
          transaction: txDoc,
          error,
          metadata: {
            amount: amountNumber,
            assetSymbol,
            senderWallet,
            receiverWallet: normalizedReceiverWallet,
          },
        });
      },
    });
    transferResultLogged = true;

    const responseBody = {
      ok: true,
      message: "Transaction submitted. Confirmation is processing.",
      transaction: {
        id: txDoc._id,
        status: txDoc.status,
        txHash: txDoc.txHash || submission.txHash || null,
        failureReason: txDoc.failureReason || null,
        reconciliationError: txDoc.reconciliationError || null,
        blockchainResultReceivedAt: txDoc.blockchainResultReceivedAt || null,
        blockchainSyncedAt: txDoc.blockchainSyncedAt || null,
        blockchainSubmittedAt: txDoc.blockchainSubmittedAt || submission.submittedAt,
        assetSymbol: normalizeTransferAssetSymbol(txDoc.assetSymbol),
      },
    };
    await completeIdempotency({
      model: idempotencyModel,
      record: idempotencyRecord,
      statusCode: 202,
      responseBody,
      transactionId: txDoc._id,
    });
    res.status(202).json(responseBody);
  } catch (err) {
    if (idempotencyRecord && !txDoc) {
      await releaseIdempotency({ model: idempotencyModel, record: idempotencyRecord }).catch(() => {});
    }
    if (err?.retryAfter) res.set("Retry-After", String(err.retryAfter));
    if (requestLinkDoc && !transferResultLogged) {
      await requestLinkModel.updateOne(
        { _id: requestLinkDoc._id, status: "claiming" },
        {
          $set: { status: isLinkExpired(requestLinkDoc) ? "expired" : "active" },
          $unset: { paidByUserId: 1, transactionId: 1, claimingAt: 1, reservedPaymentHash: 1 },
        }
      ).catch(() => {});
    }
    if (isDuplicateTransferRequestKeyError(err)) {
      if (!transferResultLogged) {
        await logResult({
          user: req.user,
          req,
          flow: "direct_send",
          transaction: txDoc,
          error: err,
        });
      }
      res.status(409);
      return next(new Error(DUPLICATE_TRANSFER_REQUEST_MESSAGE));
    }

    // If blockchain call failed, mark the transaction as failed
    if (txDoc && !["success", "failed"].includes(txDoc.status)) {
      await markFailed(txDoc, err);
    }

    if (!transferResultLogged) {
      await logResult({
        user: req.user,
        req,
        flow: "direct_send",
        transaction: txDoc,
        error: err,
      });
    }
    next(err);
  }
  }
  );

  return router;
}

transactionRouter.use(createSendTransactionRouter());

// GET /api/transactions/balance?wallet=0x...
transactionRouter.get(
  "/balance",
  protect,
  allowQueryFields(["wallet", "currency", "currencies"]),
  allowBodyFields([]),
  async (req, res, next) => {
  try {
    const { wallet } = req.query;
    const requestedCurrency = normalizeCurrencySymbol(req.query.currency);
    const requestedCurrencies = parseCurrencySymbols(req.query.currencies);
    const availableCurrencies = getAvailableCurrencySymbols();

    if (!wallet) {
      res.status(400);
      throw new Error("wallet query parameter is required");
    }

    const normalizedWallet = requireRouteEvmAddress(res, wallet, "wallet");
    const linkedWallet = await Wallet.findOne({
      userId: req.user._id,
      isVerified: true,
    }).select("address");

    if (!linkedWallet?.address) {
      res.status(400);
      throw new Error("You must link and verify a wallet before checking balance.");
    }

    const normalizedLinkedWallet = requireRouteEvmAddress(
      res,
      linkedWallet.address,
      "linked wallet address"
    );

    if (normalizedWallet !== normalizedLinkedWallet) {
      res.status(403);
      throw new Error("You can only check the balance of your verified linked wallet.");
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

    const nativeBalance = await getEthBalance(normalizedWallet);
    await updateStoredWalletBalance(normalizedWallet, nativeBalance);
    const symbolsForBalances =
      requestedCurrencies.length > 0 ? requestedCurrencies : availableCurrencies;
    const { nativeCurrency, balances } = getBalancesForSymbols(
      nativeBalance,
      symbolsForBalances
    );

    const responseCurrency = requestedCurrency || nativeCurrency;
    let responseBalance = Number(balances[responseCurrency]);
    const rateUsdPerNative = getUsdRateBySymbol(nativeCurrency);
    const fiatEquivalentUsd =
      Number.isFinite(rateUsdPerNative) && rateUsdPerNative > 0
        ? nativeBalance * rateUsdPerNative
        : null;

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
      wallet: normalizedWallet,
      balance: responseBalance,
      currency: responseCurrency,
      nativeBalance,
      nativeCurrency,
      fiatEquivalentUsd,
      fiatCurrency: "USD",
      rateUsdPerNative,
      balances,
      availableCurrencies,
    });
  } catch (err) {
    next(err);
  }
  }
);

// GET /api/transactions/my
transactionRouter.get(
  "/my",
  protect,
  allowQueryFields(["status", "from", "to", "view", "page", "limit"]),
  allowBodyFields([]),
  async (req, res, next) => {
  try {
    const {
      status,
      from,
      to,
      view = "all",
      page = "1",
      limit = "10",
    } = req.query;

    validateMyTransactionsQuery({ status, view, from, to, page, limit });

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
    if (status) {
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
        const toDate = getEndOfUtcDay(to);
        if (!isNaN(toDate)) {
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
        failureReason: t.failureReason || null,
        reconciliationError: t.reconciliationError || null,
        blockchainResultReceivedAt: t.blockchainResultReceivedAt || null,
        blockchainSyncedAt: t.blockchainSyncedAt || null,
        createdAt: t.createdAt,
        direction,
        fiatAmountUsd,
        fiatCurrency,
        rateUsdPerAsset,
        canCancel: isSender && t.status === "pending" && !t.txHash,
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
  }
);

// POST /api/transactions/:id/cancel
transactionRouter.post(
  "/:id/cancel",
  protect,
  allowQueryFields([]),
  allowBodyFields([]),
  async (req, res, next) => {
    try {
      const tx = await Transaction.findById(req.params.id).lean();
      if (!tx) {
        res.status(404);
        throw new Error("Transaction not found.");
      }

      if (normalizeObjectId(tx.senderUserId) !== req.user._id.toString()) {
        res.status(403);
        throw new Error("Only the sender can cancel this transaction.");
      }

      if (tx.status !== "pending") {
        res.status(409);
        throw new Error("Only pending transactions can be cancelled.");
      }

      if (tx.txHash) {
        res.status(409);
        throw new Error("This transaction has already been submitted to the blockchain and cannot be cancelled.");
      }

      const cancelled = await Transaction.findOneAndUpdate(
        {
          _id: tx._id,
          senderUserId: req.user._id,
          status: "pending",
          $or: [{ txHash: { $exists: false } }, { txHash: null }, { txHash: "" }],
        },
        { $set: { status: "cancelled" } },
        { new: true }
      ).lean();

      if (!cancelled) {
        res.status(409);
        throw new Error("This transaction is no longer cancellable.");
      }

      await logAudit({
        user: req.user,
        action: "TRANSFER_CANCELLED",
        metadata: { transactionId: String(cancelled._id) },
        req,
      });

      res.json({
        ok: true,
        message: "Transfer cancelled.",
        transaction: {
          id: cancelled._id,
          status: cancelled.status,
          updatedAt: cancelled.updatedAt,
          canCancel: false,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/transactions/:id
transactionRouter.get(
  "/:id",
  protect,
  allowQueryFields([]),
  allowBodyFields([]),
  async (req, res, next) => {
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
        failureReason: tx.failureReason || null,
        reconciliationError: tx.reconciliationError || null,
        blockchainResultReceivedAt: tx.blockchainResultReceivedAt || null,
        blockchainSyncedAt: tx.blockchainSyncedAt || null,
        type: tx.type || null,
        direction,
        canCancel: isSender && tx.status === "pending" && !tx.txHash,
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
  }
);
