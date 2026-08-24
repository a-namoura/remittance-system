import { ChatMessage } from "../models/ChatMessage.js";
import { ChatThread } from "../models/ChatThread.js";

function participantKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(":");
}

export async function postTransactionSystemMessage({ senderUserId, receiverUserId, text }) {
  if (!senderUserId || !receiverUserId || String(senderUserId) === String(receiverUserId)) return null;
  const systemText = String(text || "").trim();
  if (!systemText) return null;
  const key = participantKey(senderUserId, receiverUserId);
  const thread = await ChatThread.findOneAndUpdate(
    { participantKey: key },
    { $setOnInsert: { participants: [senderUserId, receiverUserId], participantKey: key }, $set: { lastMessageAt: new Date() } },
    { upsert: true, new: true }
  );
  return ChatMessage.create({ threadId: thread._id, recipientUserId: receiverUserId, messageType: "system", systemText });
}
