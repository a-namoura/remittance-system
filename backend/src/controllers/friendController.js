import mongoose from "mongoose";
import { Friend } from "../models/Friend.js";
import { User } from "../models/User.js";
import {
  createInvalidWalletAddressMessage,
  normalizeEvmAddress,
} from "../utils/walletAddress.js";

const FRIEND_LABEL_MIN_LENGTH = 2;
const FRIEND_LABEL_MAX_LENGTH = 80;
const FRIEND_USERNAME_MIN_LENGTH = 3;
const FRIEND_USERNAME_MAX_LENGTH = 30;
const FRIEND_NOTES_MAX_LENGTH = 200;

export async function listFriends(req, res, next) {
  try {
    const items = await Friend.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    const usernames = items.map((item) => String(item.username || "").trim()).filter(Boolean);
    const users = usernames.length ? await User.find({ username: { $in: usernames } }).select("_id username").lean() : [];
    const userIdByUsername = new Map(users.map((user) => [String(user.username).toLowerCase(), user._id]));

    res.json({
      ok: true,
      friends: items.map((friend) => ({
        id: friend._id,
        targetUserId: friend.targetUserId || userIdByUsername.get(String(friend.username || "").toLowerCase()) || null,
        label: friend.label,
        username: friend.username || null,
        walletAddress: friend.walletAddress || null,
        notes: friend.notes || null,
        createdAt: friend.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function createFriend(req, res, next) {
  try {
    const { label, username, walletAddress, notes, targetUserId } = req.body;

    const rawLabel = label ? String(label).trim() : "";
    const rawUsername = username ? String(username).trim() : "";
    const rawWallet = walletAddress ? String(walletAddress).trim() : "";
    const rawNotes = notes ? String(notes).trim() : "";

    if (!rawLabel) {
      res.status(400);
      throw new Error("Name is required for the contact.");
    }

    if (
      rawLabel.length < FRIEND_LABEL_MIN_LENGTH ||
      rawLabel.length > FRIEND_LABEL_MAX_LENGTH
    ) {
      res.status(400);
      throw new Error(
        `Name must be between ${FRIEND_LABEL_MIN_LENGTH} and ${FRIEND_LABEL_MAX_LENGTH} characters.`
      );
    }

    const hasUsername = rawUsername.length > 0;
    const hasWallet = rawWallet.length > 0;

    if (!hasUsername && !hasWallet) {
      res.status(400);
      throw new Error("Please provide at least a username or a wallet address.");
    }

    if (
      hasUsername &&
      (rawUsername.length < FRIEND_USERNAME_MIN_LENGTH ||
        rawUsername.length > FRIEND_USERNAME_MAX_LENGTH)
    ) {
      res.status(400);
      throw new Error(
        `Username must be between ${FRIEND_USERNAME_MIN_LENGTH} and ${FRIEND_USERNAME_MAX_LENGTH} characters.`
      );
    }

    if (rawNotes.length > FRIEND_NOTES_MAX_LENGTH) {
      res.status(400);
      throw new Error(`Notes cannot exceed ${FRIEND_NOTES_MAX_LENGTH} characters.`);
    }

    let normalizedWallet = undefined;
    if (hasWallet) {
      normalizedWallet = normalizeEvmAddress(rawWallet);
      if (!normalizedWallet) {
        res.status(400);
        throw new Error(createInvalidWalletAddressMessage("walletAddress"));
      }
    }

    const doc = await Friend.create({
      userId: req.user._id,
      targetUserId: mongoose.Types.ObjectId.isValid(String(targetUserId || "")) ? targetUserId : undefined,
      label: rawLabel,
      username: hasUsername ? rawUsername : undefined,
      walletAddress: normalizedWallet,
      notes: rawNotes || undefined,
    });

    res.status(201).json({
      ok: true,
      friend: {
        id: doc._id,
        targetUserId: doc.targetUserId || null,
        label: doc.label,
        username: doc.username || null,
        walletAddress: doc.walletAddress || null,
        notes: doc.notes || null,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      res.status(409);
      return next(new Error("You already have a contact with this name."));
    }
    next(err);
  }
}

export async function deleteFriend(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
      res.status(400);
      throw new Error("Invalid contact id.");
    }

    const doc = await Friend.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    });

    if (!doc) {
      res.status(404);
      throw new Error("Contact not found.");
    }

    res.json({
      ok: true,
      message: "Contact deleted.",
    });
  } catch (err) {
    next(err);
  }
}
