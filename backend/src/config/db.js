import mongoose from "mongoose";
import { ChatMessage } from "../models/ChatMessage.js";
import { ChatRequest } from "../models/ChatRequest.js";
import { Transaction } from "../models/Transaction.js";

async function repairSuccessfulChatRequestSettlements() {
  const settledTransactions = await Transaction.find({
    status: "success",
    chatRequestId: { $ne: null },
  })
    .select("_id chatRequestId senderUserId txHash blockchainSyncedAt")
    .lean();

  for (const transaction of settledTransactions) {
    await ChatRequest.updateOne(
      {
        _id: transaction.chatRequestId,
        status: { $in: ["pending", "processing"] },
      },
      {
        $set: {
          status: "paid",
          paidAt: transaction.blockchainSyncedAt || new Date(),
          paidByUserId: transaction.senderUserId,
          paidTransactionId: transaction._id,
          paidTxHash: transaction.txHash || null,
          processingAt: null,
        },
      }
    );
  }
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing. Set it in backend/.env");
  }

  if (process.env.NODE_ENV === "production") {
    let url;
    try { url = new URL(uri); } catch { throw new Error("MONGODB_URI must be a valid MongoDB connection string."); }
    if (!url.username || !url.password || !["mongodb:", "mongodb+srv:"].includes(url.protocol)) {
      throw new Error("Production MONGODB_URI must use an authenticated MongoDB user.");
    }
    if (url.searchParams.get("tls") !== "true" && url.searchParams.get("ssl") !== "true" && url.protocol !== "mongodb+srv:") {
      throw new Error("Production MONGODB_URI must require TLS (use tls=true or mongodb+srv).");
    }
  }

  try {
    await mongoose.connect(uri, { tls: process.env.NODE_ENV === "production" ? true : undefined });
    // Purge plaintext cached by older releases before accepting requests.
    await ChatMessage.collection.updateMany(
      { plaintextFallback: { $exists: true } },
      { $unset: { plaintextFallback: "" } }
    );
    await ChatRequest.collection.updateMany(
      { note: { $exists: true } },
      { $unset: { note: "" } }
    );
    await repairSuccessfulChatRequestSettlements();
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}
