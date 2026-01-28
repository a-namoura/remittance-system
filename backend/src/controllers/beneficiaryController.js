import { Beneficiary } from "../models/Beneficiary.js";

export async function listBeneficiaries(req, res, next) {
  try {
    const items = await Beneficiary.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      ok: true,
      beneficiaries: items.map((b) => ({
        id: b._id,
        label: b.label,
        username: b.username || null,
        walletAddress: b.walletAddress || null,
        notes: b.notes || null,
        createdAt: b.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function createBeneficiary(req, res, next) {
  try {
    const { label, username, walletAddress, notes } = req.body;

    const rawLabel = label ? String(label).trim() : "";
    const rawUsername = username ? String(username).trim() : "";
    const rawWallet = walletAddress ? String(walletAddress).trim() : "";

    if (!rawLabel) {
      res.status(400);
      throw new Error("Name is required for the beneficiary.");
    }

    const hasUsername = rawUsername.length > 0;
    const hasWallet = rawWallet.length > 0;

    // 🔴 Rule: at least username or wallet
    if (!hasUsername && !hasWallet) {
      res.status(400);
      throw new Error(
        "Please provide at least a username or a wallet address."
      );
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

    const doc = await Beneficiary.create({
      userId: req.user._id,
      label: rawLabel,
      username: hasUsername ? rawUsername : undefined,
      walletAddress: normalizedWallet,
      notes: notes ? String(notes).trim() : undefined,
    });

    res.status(201).json({
      ok: true,
      beneficiary: {
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
      return next(
        new Error("You already have a beneficiary with this name (label).")
      );
    }
    next(err);
  }
}

export async function deleteBeneficiary(req, res, next) {
  try {
    const { id } = req.params;

    const doc = await Beneficiary.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    });

    if (!doc) {
      res.status(404);
      throw new Error("Beneficiary not found.");
    }

    res.json({
      ok: true,
      message: "Beneficiary deleted.",
    });
  } catch (err) {
    next(err);
  }
}
