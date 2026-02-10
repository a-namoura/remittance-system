import { Friend } from "../models/Friend.js";

export async function listFriends(req, res, next) {
  try {
    const items = await Friend.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      ok: true,
      friends: items.map((friend) => ({
        id: friend._id,
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
    const { label, username, walletAddress, notes } = req.body;

    const rawLabel = label ? String(label).trim() : "";
    const rawUsername = username ? String(username).trim() : "";
    const rawWallet = walletAddress ? String(walletAddress).trim() : "";

    if (!rawLabel) {
      res.status(400);
      throw new Error("Name is required for the friend.");
    }

    const hasUsername = rawUsername.length > 0;
    const hasWallet = rawWallet.length > 0;

    if (!hasUsername && !hasWallet) {
      res.status(400);
      throw new Error("Please provide at least a username or a wallet address.");
    }

    if (hasUsername && rawUsername.length < 2) {
      res.status(400);
      throw new Error("Username must be at least 2 characters.");
    }

    let normalizedWallet = undefined;
    if (hasWallet) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(rawWallet)) {
        res.status(400);
        throw new Error("walletAddress must be a valid EVM address.");
      }
      normalizedWallet = rawWallet.toLowerCase();
    }

    const doc = await Friend.create({
      userId: req.user._id,
      label: rawLabel,
      username: hasUsername ? rawUsername : undefined,
      walletAddress: normalizedWallet,
      notes: notes ? String(notes).trim() : undefined,
    });

    res.status(201).json({
      ok: true,
      friend: {
        id: doc._id,
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
      return next(new Error("You already have a friend with this name."));
    }
    next(err);
  }
}

export async function deleteFriend(req, res, next) {
  try {
    const { id } = req.params;

    const doc = await Friend.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    });

    if (!doc) {
      res.status(404);
      throw new Error("Friend not found.");
    }

    res.json({
      ok: true,
      message: "Friend deleted.",
    });
  } catch (err) {
    next(err);
  }
}
