import { ethers } from "ethers";
import { Wallet } from "../models/Wallet.js";

// POST /api/wallet/link
// body: { address, signature, message }
export async function linkWallet(req, res) {
  const { address, signature, message } = req.body;

  if (!address || !signature || !message) {
    return res.status(400).json({ message: "address, signature, and message are required" });
  }

  // Recover signer address from the signature
  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch (e) {
    return res.status(400).json({ message: "Invalid signature format" });
  }

  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return res.status(401).json({ message: "Signature does not match address" });
  }

  // Upsert wallet linked to this user
  const doc = await Wallet.findOneAndUpdate(
    { userId: req.user._id },
    {
      userId: req.user._id,
      address,
      isVerified: true,
      verifiedAt: new Date(),
    },
    { new: true, upsert: true }
  );

  return res.json({
    ok: true,
    wallet: {
      address: doc.address,
      isVerified: doc.isVerified,
      verifiedAt: doc.verifiedAt,
    },
  });
}
