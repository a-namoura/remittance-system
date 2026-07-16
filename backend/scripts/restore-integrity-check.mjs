import mongoose from "mongoose";

const uri = process.env.RESTORE_MONGODB_URI;
if (!uri || process.env.RESTORE_CHECK_CONFIRM !== "check-only") {
  throw new Error("Set RESTORE_MONGODB_URI and RESTORE_CHECK_CONFIRM=check-only.");
}
const target = new URL(uri);
if (!target.username || !target.password || (target.protocol !== "mongodb+srv:" && target.searchParams.get("tls") !== "true")) {
  throw new Error("Integrity checks require an authenticated TLS MongoDB URI.");
}
await mongoose.connect(uri);
try {
  const db = mongoose.connection.db;
  const duplicateHashes = await db.collection("transactions").aggregate([
    { $match: { txHash: { $type: "string", $ne: "" } } },
    { $group: { _id: "$txHash", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();
  const brokenTransactionLinks = await db.collection("transactions").aggregate([
    { $match: { paymentLinkId: { $exists: true } } },
    { $lookup: { from: "paymentlinks", localField: "paymentLinkId", foreignField: "_id", as: "link" } },
    { $match: { link: { $size: 0 } } }, { $limit: 1 },
  ]).toArray();
  const brokenLinkHashes = await db.collection("paymentlinks").aggregate([
    { $match: { txHash: { $type: "string", $ne: "" } } },
    { $lookup: { from: "transactions", localField: "txHash", foreignField: "txHash", as: "transaction" } },
    { $match: { transaction: { $size: 0 } } }, { $limit: 1 },
  ]).toArray();
  if (duplicateHashes.length || brokenTransactionLinks.length || brokenLinkHashes.length) {
    throw new Error("Restore integrity failed: duplicate txHash or broken payment-link transaction reference.");
  }
  console.info("Restore integrity passed: transaction hashes are unique and payment-link txHash references resolve. No transactions were submitted.");
} finally {
  await mongoose.disconnect();
}
