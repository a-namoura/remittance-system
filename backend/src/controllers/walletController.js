import { ethers } from "ethers";
import crypto from "crypto";
import mongoose from "mongoose";
import { Wallet } from "../models/Wallet.js";
import { WalletChallenge } from "../models/WalletChallenge.js";
import {
  createInvalidWalletAddressMessage,
  normalizeEvmAddress,
} from "../utils/walletAddress.js";
import { logAudit } from "../utils/audit.js";
import { refreshWalletBalance } from "../utils/walletBalances.js";

const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function hashChallengeMessage(message) {
  return crypto.createHash("sha256").update(String(message)).digest("hex");
}

function normalizeWalletAddress(address) {
  return normalizeEvmAddress(address);
}

async function logWalletConnectionEvent({
  req,
  operation,
  outcome,
  walletAddress,
  reason,
  metadata = {},
}) {
  await logAudit({
    user: req.user,
    action:
      outcome === "attempt"
        ? "WALLET_CONNECTION_ATTEMPT"
        : "WALLET_CONNECTION_RESULT",
    metadata: {
      operation,
      outcome,
      walletAddress: walletAddress || null,
      reason: reason || null,
      ...metadata,
    },
    req,
  });
}

async function respondWalletConnectionFailure(
  res,
  { req, operation, walletAddress, reason, status, message }
) {
  await logWalletConnectionEvent({
    req,
    operation,
    outcome: "failed",
    walletAddress,
    reason,
  });
  return res.status(status).json({ message });
}

function buildWalletChallengeMessage({ userId, nonce, expiresAt }) {
  return [
    "Verify wallet ownership",
    `User: ${userId}`,
    `Code: ${nonce}`,
    `Expires: ${expiresAt.toISOString()}`,
    "No transaction is made from this action.",
  ].join("\n");
}

// POST /api/wallet/challenge
// body: { address }
export async function createWalletChallenge(req, res) {
  const address = normalizeWalletAddress(req.body?.address);
  await logWalletConnectionEvent({
    req,
    operation: "challenge",
    outcome: "attempt",
    walletAddress: address,
  });

  if (!address) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "challenge",
      walletAddress: null,
      reason: "invalid_address",
      status: 400,
      message: createInvalidWalletAddressMessage("address"),
    });
  }

  const userId = req.user._id;
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + WALLET_CHALLENGE_TTL_MS);
  const message = buildWalletChallengeMessage({
    userId,
    nonce,
    expiresAt,
  });

  await WalletChallenge.updateMany(
    { userId, address, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );

  const challenge = await WalletChallenge.create({
    userId,
    address,
    messageHash: hashChallengeMessage(message),
    expiresAt,
  });

  await logWalletConnectionEvent({
    req,
    operation: "challenge",
    outcome: "success",
    walletAddress: address,
    metadata: { challengeId: String(challenge._id) },
  });

  return res.status(201).json({
    ok: true,
    challengeId: challenge._id,
    message,
    expiresAt,
  });
}

// POST /api/wallet/link
// body: { address, signature, message, challengeId }
export async function linkWallet(req, res) {
  const { address, signature, message, challengeId } = req.body;
  const normalizedAddress = normalizeWalletAddress(address);

  await logWalletConnectionEvent({
    req,
    operation: "link",
    outcome: "attempt",
    walletAddress: normalizedAddress,
  });

  if (!address || !signature || !message || !challengeId) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "link",
      walletAddress: normalizedAddress,
      reason: "missing_required_fields",
      status: 400,
      message: "address, signature, message, and challengeId are required",
    });
  }

  if (!normalizedAddress) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "link",
      walletAddress: null,
      reason: "invalid_address",
      status: 400,
      message: createInvalidWalletAddressMessage("address"),
    });
  }

  if (!mongoose.Types.ObjectId.isValid(String(challengeId))) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "link",
      walletAddress: normalizedAddress,
      reason: "invalid_challenge_id",
      status: 400,
      message: "Wallet ownership verification failed. The challenge is invalid.",
    });
  }

  const challenge = await WalletChallenge.findOne({
    _id: challengeId,
    userId: req.user._id,
    address: normalizedAddress,
    consumedAt: null,
  });

  if (!challenge) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "link",
      walletAddress: normalizedAddress,
      reason: "challenge_missing_or_used",
      status: 400,
      message:
        "Wallet ownership verification failed. The challenge is invalid or already used.",
    });
  }

  if (challenge.expiresAt.getTime() <= Date.now()) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "link",
      walletAddress: normalizedAddress,
      reason: "challenge_expired",
      status: 400,
      message:
        "Wallet ownership verification failed. The challenge has expired. Please try again.",
    });
  }

  if (challenge.messageHash !== hashChallengeMessage(message)) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "link",
      walletAddress: normalizedAddress,
      reason: "challenge_message_mismatch",
      status: 400,
      message:
        "Wallet ownership verification failed. The signed message does not match the active challenge.",
    });
  }

  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch (e) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "link",
      walletAddress: normalizedAddress,
      reason: "invalid_signature_format",
      status: 400,
      message:
        "Wallet ownership verification failed. The signature format is invalid.",
    });
  }

  if (normalizeWalletAddress(recovered) !== normalizedAddress) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "link",
      walletAddress: normalizedAddress,
      reason: "signature_address_mismatch",
      status: 400,
      message:
        "Wallet ownership verification failed. The signed message does not match the selected wallet address.",
    });
  }

  const userId = req.user._id;
  const consumedChallenge = await WalletChallenge.findOneAndUpdate(
    {
      _id: challenge._id,
      userId,
      address: normalizedAddress,
      messageHash: challenge.messageHash,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!consumedChallenge) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "link",
      walletAddress: normalizedAddress,
      reason: "challenge_expired_or_used",
      status: 400,
      message:
        "Wallet ownership verification failed. The challenge has expired or was already used.",
    });
  }

  const existingForAddress = await Wallet.findOne({
    address: normalizedAddress,
  });

  if (
    existingForAddress &&
    existingForAddress.userId.toString() !== userId.toString()
  ) {
    return respondWalletConnectionFailure(res, {
      req,
      operation: "link",
      walletAddress: normalizedAddress,
      reason: "address_linked_to_another_user",
      status: 409,
      message:
        "This wallet address is already linked to another account. A wallet can only be linked to one user.",
    });
  }

  const doc = await Wallet.findOneAndUpdate(
    { userId },
    {
      userId,
      address: normalizedAddress,
      isVerified: true,
      verifiedAt: new Date(),
    },
    { returnDocument: "after", runValidators: true, upsert: true }
  );

  await refreshWalletBalance(doc.address);
  const walletForResponse = (await Wallet.findById(doc._id).lean()) || doc;

  await logWalletConnectionEvent({
    req,
    operation: "link",
    outcome: "success",
    walletAddress: doc.address,
  });

  return res.json({
    ok: true,
    message: "Wallet successfully verified and linked to your account.",
    wallet: {
      address: walletForResponse.address,
      isVerified: walletForResponse.isVerified,
      verifiedAt: walletForResponse.verifiedAt,
      balance: walletForResponse.nativeBalance ?? null,
      balanceSymbol: walletForResponse.nativeBalanceSymbol || null,
      balanceUpdatedAt: walletForResponse.nativeBalanceUpdatedAt || null,
      balanceSyncError: walletForResponse.balanceSyncError || null,
    },
  });
}

// DELETE /api/wallet/link
export async function unlinkWallet(req, res) {
  const userId = req.user._id;

  await logWalletConnectionEvent({
    req,
    operation: "unlink",
    outcome: "attempt",
  });

  const walletDoc = await Wallet.findOneAndDelete({ userId });

  await logWalletConnectionEvent({
    req,
    operation: "unlink",
    outcome: "success",
    walletAddress: walletDoc?.address || null,
    metadata: { walletExisted: Boolean(walletDoc) },
  });

  return res.json({
    ok: true,
    message: "Wallet unlinked from this account.",
  });
}
