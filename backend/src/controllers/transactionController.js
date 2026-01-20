import { Transaction } from "../models/Transaction.js";
import { sendRemittance } from "../blockchain/remittanceClient.js";

// POST /api/transactions/send
// body: { receiver, amountEth }
export async function sendTransaction(req, res) {
  const { receiver, amountEth } = req.body;

  if (!receiver || !amountEth) {
    return res.status(400).json({ message: "receiver and amountEth are required" });
  }

  // 1) Create transaction as pending
  const txDoc = await Transaction.create({
    userId: req.user._id,
    receiver,
    amountEth: String(amountEth),
    status: "pending",
  });

  try {
    // 2) Send on-chain tx
    const result = await sendRemittance(receiver, amountEth);

    // result may contain txHash depending on your client implementation
    const txHash =
      result?.txHash ||
      result?.hash ||
      result?.receipt?.hash ||
      result?.receipt?.transactionHash;

    // 3) Mark success
    txDoc.status = "success";
    if (txHash) txDoc.txHash = txHash;
    await txDoc.save();

    return res.json({
      ok: true,
      transaction: {
        id: txDoc._id,
        receiver: txDoc.receiver,
        amountEth: txDoc.amountEth,
        status: txDoc.status,
        txHash: txDoc.txHash || null,
        createdAt: txDoc.createdAt,
      },
    });
  } catch (err) {
    // 4) Mark failed
    txDoc.status = "failed";
    txDoc.error = err?.message || "Transaction failed";
    await txDoc.save();

    return res.status(500).json({
      message: txDoc.error,
      transactionId: txDoc._id,
    });
  }
}

// GET /api/transactions/my?limit=10
export async function getMyTransactions(req, res) {
  const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);

  const txs = await Transaction.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.json({
    ok: true,
    transactions: txs.map((t) => ({
      id: t._id,
      receiver: t.receiver,
      amountEth: t.amountEth,
      status: t.status,
      txHash: t.txHash || null,
      error: t.error || null,
      createdAt: t.createdAt,
    })),
  });
}
