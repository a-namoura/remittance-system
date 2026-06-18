import { ethers } from "ethers";
import crypto from "crypto";
import mongoose from "mongoose";
import { Wallet } from "../models/Wallet.js";
import { WalletChallenge } from "../models/WalletChallenge.js";
import {
  createInvalidWalletAddressMessage,
  normalizeEvmAddress,
} from "../utils/walletAddress.js";

const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function hashChallengeMessage(message) {
  return crypto.createHash("sha256").update(String(message)).digest("hex");
}

function normalizeWalletAddress(address) {
  return normalizeEvmAddress(address);
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
  if (!address) {
    return res
      .status(400)
      .json({ message: createInvalidWalletAddressMessage("address") });
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

  if (!address || !signature || !message || !challengeId) {
    return res.status(400).json({
      message: "address, signature, message, and challengeId are required",
    });
  }

  const normalizedAddress = normalizeWalletAddress(address);
  if (!normalizedAddress) {
    return res
      .status(400)
      .json({ message: createInvalidWalletAddressMessage("address") });
  }

  if (!mongoose.Types.ObjectId.isValid(String(challengeId))) {
    return res.status(400).json({
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
    return res.status(400).json({
      message:
        "Wallet ownership verification failed. The challenge is invalid or already used.",
    });
  }

  if (challenge.expiresAt.getTime() <= Date.now()) {
    return res.status(400).json({
      message:
        "Wallet ownership verification failed. The challenge has expired. Please try again.",
    });
  }

  if (challenge.messageHash !== hashChallengeMessage(message)) {
    return res.status(400).json({
      message:
        "Wallet ownership verification failed. The signed message does not match the active challenge.",
    });
  }

  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch (e) {
    return res.status(400).json({
      message:
        "Wallet ownership verification failed. The signature format is invalid.",
    });
  }

  if (normalizeWalletAddress(recovered) !== normalizedAddress) {
    return res
      .status(400)
      .json({
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
    { new: true }
  );

  if (!consumedChallenge) {
    return res.status(400).json({
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
    return res.status(409).json({
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
    { new: true, runValidators: true, upsert: true }
  );

  return res.json({
    ok: true,
    message: "Wallet successfully verified and linked to your account.",
    wallet: {
      address: doc.address,
      isVerified: doc.isVerified,
      verifiedAt: doc.verifiedAt,
    },
  });
}

// DELETE /api/wallet/link
export async function unlinkWallet(req, res) {
  const userId = req.user._id;

  await Wallet.findOneAndDelete({ userId });

  return res.json({
    ok: true,
    message: "Wallet unlinked from this account.",
  });
}
