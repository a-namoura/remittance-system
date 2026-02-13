import express from "express";
import mongoose from "mongoose";
import { protect } from "../middleware/authMiddleware.js";
import { Friend } from "../models/Friend.js";
import { Wallet } from "../models/Wallet.js";
import { User } from "../models/User.js";
import { ChatKey } from "../models/ChatKey.js";
import { ChatThread } from "../models/ChatThread.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { ChatRequest } from "../models/ChatRequest.js";
import { Transaction } from "../models/Transaction.js";
import {
  getEthBalance,
  sendRemittance,
} from "../blockchain/remittanceClient.js";
import { logAudit } from "../utils/audit.js";
import { requireAndConsumePaymentCode } from "../utils/paymentVerification.js";

export const chatRouter = express.Router();

function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getUserDisplayName(userDoc) {
  return (
    [userDoc?.firstName, userDoc?.lastName].filter(Boolean).join(" ").trim() ||
    userDoc?.username ||
    "User"
  );
}

function buildParticipantKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(":");
}

function asObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(id));
}

function validEncryptedPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const ciphertext = String(payload.ciphertext || "").trim();
  const iv = String(payload.iv || "").trim();
  const wrappedKey = String(payload.wrappedKey || "").trim();

  if (!ciphertext || !iv || !wrappedKey) return false;
  if (ciphertext.length > 16000 || iv.length > 256 || wrappedKey.length > 4096) {
    return false;
  }

  return true;
}

async function resolveFriendContacts(userId) {
  const friendDocs = await Friend.find({ userId })
    .select("label username walletAddress notes createdAt")
    .sort({ createdAt: -1 })
    .lean();

  if (!friendDocs.length) return [];

  const usernames = [
    ...new Set(
      friendDocs
        .map((friend) => String(friend.username || "").trim())
        .filter(Boolean)
    ),
  ];

  const wallets = [
    ...new Set(
      friendDocs
        .map((friend) => normalizeAddress(friend.walletAddress))
        .filter(Boolean)
    ),
  ];

  const [usersByUsername, walletDocs] = await Promise.all([
    usernames.length
      ? User.find({
          isDisabled: { $ne: true },
          $or: usernames.map((username) => ({
            username: new RegExp(`^${escapeRegex(username)}$`, "i"),
          })),
        })
          .select("_id username firstName lastName")
          .lean()
      : [],
    wallets.length
      ? Wallet.find({
          address: { $in: wallets },
          isVerified: true,
        })
          .select("userId address")
          .lean()
      : [],
  ]);

  const walletUserIds = [
    ...new Set(walletDocs.map((walletDoc) => String(walletDoc.userId))),
  ];

  const usersByWallet = walletUserIds.length
    ? await User.find({
        _id: { $in: walletUserIds },
        isDisabled: { $ne: true },
      })
        .select("_id username firstName lastName")
        .lean()
    : [];

  const userByUsername = new Map(
    usersByUsername.map((userDoc) => [
      String(userDoc.username || "").toLowerCase(),
      userDoc,
    ])
  );

  const userById = new Map(
    usersByWallet.map((userDoc) => [String(userDoc._id), userDoc])
  );

  const userIdByWallet = new Map(
    walletDocs.map((walletDoc) => [
      normalizeAddress(walletDoc.address),
      String(walletDoc.userId),
    ])
  );

  const walletByUserId = new Map();
  for (const walletDoc of walletDocs) {
    const key = String(walletDoc.userId);
    if (!walletByUserId.has(key)) {
      walletByUserId.set(key, normalizeAddress(walletDoc.address));
    }
  }

  const currentUserId = String(userId);
  const seenPeerIds = new Set();
  const contacts = [];

  for (const friend of friendDocs) {
    const usernameKey = String(friend.username || "").trim().toLowerCase();
    const walletKey = normalizeAddress(friend.walletAddress);

    let peerUser = usernameKey ? userByUsername.get(usernameKey) : null;
    if (!peerUser && walletKey) {
      const ownerId = userIdByWallet.get(walletKey);
      if (ownerId) {
        peerUser = userById.get(ownerId) || null;
      }
    }

    if (!peerUser) continue;

    const peerUserId = String(peerUser._id);
    if (peerUserId === currentUserId) continue;
    if (seenPeerIds.has(peerUserId)) continue;

    seenPeerIds.add(peerUserId);

    contacts.push({
      friendId: friend._id,
      label: friend.label,
      username: friend.username || null,
      walletAddress: normalizeAddress(friend.walletAddress) || null,
      notes: friend.notes || null,
      createdAt: friend.createdAt,
      peerUserId,
      peerUsername: peerUser.username || null,
      peerDisplayName: getUserDisplayName(peerUser),
      peerWalletAddress: walletByUserId.get(peerUserId) || null,
    });
  }

  return contacts;
}

async function resolveFriendContactByPeer(userId, peerUserId) {
  const contacts = await resolveFriendContacts(userId);
  return contacts.find(
    (contact) => String(contact.peerUserId) === String(peerUserId)
  );
}

function threadContainsUser(threadDoc, userId) {
  const userIdStr = String(userId);
  return threadDoc.participants.some(
    (participantId) => String(participantId) === userIdStr
  );
}

function otherParticipantId(threadDoc, userId) {
  const userIdStr = String(userId);
  const peer = threadDoc.participants.find(
    (participantId) => String(participantId) !== userIdStr
  );
  return peer ? String(peer) : null;
}

chatRouter.get("/friends", protect, async (req, res, next) => {
  try {
    const contacts = await resolveFriendContacts(req.user._id);
    res.json({
      ok: true,
      friends: contacts,
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.put("/keys/public", protect, async (req, res, next) => {
  try {
    const publicKeyJwk = req.body?.publicKeyJwk;

    if (!publicKeyJwk || typeof publicKeyJwk !== "object" || Array.isArray(publicKeyJwk)) {
      res.status(400);
      throw new Error("publicKeyJwk is required.");
    }

    if (!publicKeyJwk.kty) {
      res.status(400);
      throw new Error("publicKeyJwk is invalid.");
    }

    const keyDoc = await ChatKey.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { publicKeyJwk } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      ok: true,
      updatedAt: keyDoc.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.get("/keys/:userId", protect, async (req, res, next) => {
  try {
    const requestedUserId = asObjectId(req.params.userId);
    if (!requestedUserId) {
      res.status(400);
      throw new Error("Invalid userId.");
    }

    const requesterId = String(req.user._id);
    const peerId = String(requestedUserId);

    if (requesterId !== peerId) {
      const contact = await resolveFriendContactByPeer(req.user._id, requestedUserId);
      if (!contact) {
        res.status(403);
        throw new Error("Encrypted chat is only available with saved friends.");
      }
    }

    const keyDoc = await ChatKey.findOne({ userId: requestedUserId }).lean();
    if (!keyDoc) {
      res.status(404);
      throw new Error("Recipient has not enabled encrypted chat yet.");
    }

    res.json({
      ok: true,
      userId: requestedUserId,
      publicKeyJwk: keyDoc.publicKeyJwk,
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.get("/threads/:peerUserId", protect, async (req, res, next) => {
  try {
    const peerUserId = asObjectId(req.params.peerUserId);
    if (!peerUserId) {
      res.status(400);
      throw new Error("Invalid peer user id.");
    }

    if (String(peerUserId) === String(req.user._id)) {
      res.status(400);
      throw new Error("Cannot create a chat with yourself.");
    }

    const friendContact = await resolveFriendContactByPeer(req.user._id, peerUserId);
    if (!friendContact) {
      res.status(403);
      throw new Error("You can only open request chats with your saved friends.");
    }

    const participantKey = buildParticipantKey(req.user._id, peerUserId);
    let thread = await ChatThread.findOne({ participantKey }).lean();

    if (!thread) {
      try {
        const createdThread = await ChatThread.create({
          participants: [req.user._id, peerUserId],
          participantKey,
          lastMessageAt: new Date(),
        });
        thread = createdThread.toObject();
      } catch (createErr) {
        if (createErr?.code === 11000) {
          thread = await ChatThread.findOne({ participantKey }).lean();
        } else {
          throw createErr;
        }
      }
    }

    const peerKeyDoc = await ChatKey.findOne({ userId: peerUserId })
      .select("_id")
      .lean();

    res.json({
      ok: true,
      thread: {
        id: thread._id,
        participantKey: thread.participantKey,
        participants: thread.participants,
        lastMessageAt: thread.lastMessageAt,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
      peer: {
        userId: friendContact.peerUserId,
        displayName: friendContact.peerDisplayName,
        username: friendContact.peerUsername,
        walletAddress: friendContact.peerWalletAddress,
        friendLabel: friendContact.label,
        hasChatPublicKey: Boolean(peerKeyDoc),
      },
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.get("/threads/:threadId/history", protect, async (req, res, next) => {
  try {
    const threadId = asObjectId(req.params.threadId);
    if (!threadId) {
      res.status(400);
      throw new Error("Invalid thread id.");
    }

    const thread = await ChatThread.findById(threadId).lean();
    if (!thread) {
      res.status(404);
      throw new Error("Chat thread not found.");
    }

    if (!threadContainsUser(thread, req.user._id)) {
      res.status(403);
      throw new Error("You do not have access to this chat thread.");
    }

    const parsedLimit = Number.parseInt(String(req.query.limit || "120"), 10);
    const limit = Math.min(Math.max(parsedLimit || 120, 1), 400);
    const viewerId = String(req.user._id);

    const messagesRaw = await ChatMessage.find({ threadId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const requestIds = messagesRaw
      .map((messageDoc) => asObjectId(messageDoc.requestId))
      .filter(Boolean);

    const requestDocs = requestIds.length
      ? await ChatRequest.find({
          _id: { $in: requestIds },
        }).lean()
      : [];

    const requestById = new Map(
      requestDocs.map((requestDoc) => [String(requestDoc._id), requestDoc])
    );

    const messages = messagesRaw
      .reverse()
      .map((messageDoc) => {
        const isSender = String(messageDoc.senderUserId) === viewerId;
        const attachedRequest = messageDoc.requestId
          ? requestById.get(String(messageDoc.requestId)) || null
          : null;
        return {
          id: messageDoc._id,
          senderUserId: messageDoc.senderUserId,
          recipientUserId: messageDoc.recipientUserId,
          messageType: messageDoc.messageType,
          request: attachedRequest
            ? {
                id: attachedRequest._id,
                requesterUserId: attachedRequest.requesterUserId,
                targetUserId: attachedRequest.targetUserId,
                amount: attachedRequest.amount,
                note: attachedRequest.note || "",
                status: attachedRequest.status,
                paidAt: attachedRequest.paidAt || null,
                paidByUserId: attachedRequest.paidByUserId || null,
                paidTransactionId: attachedRequest.paidTransactionId || null,
                paidTxHash: attachedRequest.paidTxHash || null,
                cancelledAt: attachedRequest.cancelledAt || null,
                cancelledByUserId: attachedRequest.cancelledByUserId || null,
                createdAt: attachedRequest.createdAt,
              }
            : null,
          encryptedPayload: isSender
            ? messageDoc.cipherForSender
            : messageDoc.cipherForRecipient,
          createdAt: messageDoc.createdAt,
        };
      });

    const [participantA, participantB] = thread.participants;
    const paymentsRaw = await Transaction.find({
      $or: [
        { senderUserId: participantA, receiverUserId: participantB },
        { senderUserId: participantB, receiverUserId: participantA },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    const payments = paymentsRaw.map((paymentDoc) => {
      const senderId = String(paymentDoc.senderUserId || "");
      const receiverId = String(paymentDoc.receiverUserId || "");
      const direction =
        senderId === viewerId
          ? "sent"
          : receiverId === viewerId
          ? "received"
          : "unknown";

      return {
        id: paymentDoc._id,
        senderUserId: paymentDoc.senderUserId,
        receiverUserId: paymentDoc.receiverUserId,
        senderWallet: paymentDoc.senderWallet,
        receiverWallet: paymentDoc.receiverWallet,
        amount: paymentDoc.amount,
        status: paymentDoc.status,
        txHash: paymentDoc.txHash || null,
        direction,
        createdAt: paymentDoc.createdAt,
      };
    });

    res.json({
      ok: true,
      thread: {
        id: thread._id,
        participants: thread.participants,
        lastMessageAt: thread.lastMessageAt,
      },
      messages,
      payments,
      privacyNotice:
        "Messages are stored as end-to-end encrypted payloads. Payment records remain visible to the system.",
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.post("/threads/:threadId/messages", protect, async (req, res, next) => {
  try {
    const threadId = asObjectId(req.params.threadId);
    if (!threadId) {
      res.status(400);
      throw new Error("Invalid thread id.");
    }

    const thread = await ChatThread.findById(threadId);
    if (!thread) {
      res.status(404);
      throw new Error("Chat thread not found.");
    }

    if (!threadContainsUser(thread, req.user._id)) {
      res.status(403);
      throw new Error("You do not have access to this chat thread.");
    }

    const senderUserId = String(req.user._id);
    const inferredRecipientUserId = otherParticipantId(thread, req.user._id);
    const recipientUserId =
      req.body?.recipientUserId != null
        ? String(req.body.recipientUserId)
        : inferredRecipientUserId;

    if (!recipientUserId || recipientUserId !== inferredRecipientUserId) {
      res.status(400);
      throw new Error("recipientUserId must be the other participant in this thread.");
    }

    const messageType = String(req.body?.messageType || "text");
    if (!["text", "request"].includes(messageType)) {
      res.status(400);
      throw new Error("messageType must be either 'text' or 'request'.");
    }

    const senderPayload = req.body?.payloadForSender;
    const recipientPayload = req.body?.payloadForRecipient;

    if (!validEncryptedPayload(senderPayload) || !validEncryptedPayload(recipientPayload)) {
      res.status(400);
      throw new Error(
        "payloadForSender and payloadForRecipient must include ciphertext, iv, and wrappedKey."
      );
    }

    let createdRequest = null;
    if (messageType === "request") {
      const requestAmount = Number(req.body?.requestAmount);
      const requestNote = String(req.body?.requestNote || "").trim();

      if (!Number.isFinite(requestAmount) || requestAmount <= 0) {
        res.status(400);
        throw new Error("requestAmount must be a positive number.");
      }

      if (requestNote.length > 280) {
        res.status(400);
        throw new Error("requestNote cannot exceed 280 characters.");
      }

      createdRequest = await ChatRequest.create({
        threadId: thread._id,
        requesterUserId: senderUserId,
        targetUserId: recipientUserId,
        amount: requestAmount,
        note: requestNote || undefined,
        status: "pending",
      });
    }

    let createdMessage;
    try {
      createdMessage = await ChatMessage.create({
        threadId: thread._id,
        senderUserId,
        recipientUserId,
        messageType,
        requestId: createdRequest?._id || undefined,
        cipherForSender: {
          ciphertext: String(senderPayload.ciphertext).trim(),
          iv: String(senderPayload.iv).trim(),
          wrappedKey: String(senderPayload.wrappedKey).trim(),
        },
        cipherForRecipient: {
          ciphertext: String(recipientPayload.ciphertext).trim(),
          iv: String(recipientPayload.iv).trim(),
          wrappedKey: String(recipientPayload.wrappedKey).trim(),
        },
      });
    } catch (createMessageErr) {
      if (createdRequest?._id) {
        await ChatRequest.deleteOne({ _id: createdRequest._id }).catch(() => {});
      }
      throw createMessageErr;
    }

    thread.lastMessageAt = new Date();
    await thread.save();

    res.status(201).json({
      ok: true,
      message: {
        id: createdMessage._id,
        senderUserId: createdMessage.senderUserId,
        recipientUserId: createdMessage.recipientUserId,
        messageType: createdMessage.messageType,
        request: createdRequest
          ? {
              id: createdRequest._id,
              requesterUserId: createdRequest.requesterUserId,
              targetUserId: createdRequest.targetUserId,
              amount: createdRequest.amount,
              note: createdRequest.note || "",
              status: createdRequest.status,
              createdAt: createdRequest.createdAt,
            }
          : null,
        encryptedPayload: createdMessage.cipherForSender,
        createdAt: createdMessage.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.post(
  "/threads/:threadId/requests/:requestId/pay",
  protect,
  async (req, res, next) => {
    let txDoc = null;
    let lockedRequest = null;

    try {
      const threadId = asObjectId(req.params.threadId);
      const requestId = asObjectId(req.params.requestId);

      if (!threadId || !requestId) {
        res.status(400);
        throw new Error("Invalid threadId or requestId.");
      }

      const thread = await ChatThread.findById(threadId);
      if (!thread) {
        res.status(404);
        throw new Error("Chat thread not found.");
      }

      if (!threadContainsUser(thread, req.user._id)) {
        res.status(403);
        throw new Error("You do not have access to this chat thread.");
      }

      const requestDoc = await ChatRequest.findById(requestId);
      if (!requestDoc || String(requestDoc.threadId) !== String(threadId)) {
        res.status(404);
        throw new Error("Request not found in this chat.");
      }

      if (requestDoc.status === "paid") {
        res.status(409);
        throw new Error("Request has already been paid.");
      }

      if (requestDoc.status === "cancelled") {
        res.status(409);
        throw new Error("Request has been cancelled.");
      }

      if (String(requestDoc.targetUserId) !== String(req.user._id)) {
        res.status(403);
        throw new Error("Only the requested user can send this payment.");
      }

      const payerWalletDoc = await Wallet.findOne({
        userId: req.user._id,
        isVerified: true,
      })
        .select("address")
        .lean();
      if (!payerWalletDoc?.address) {
        res.status(400);
        throw new Error("You must link and verify a wallet before sending.");
      }

      const requesterWalletDoc = await Wallet.findOne({
        userId: requestDoc.requesterUserId,
        isVerified: true,
      })
        .select("address")
        .lean();
      if (!requesterWalletDoc?.address) {
        res.status(400);
        throw new Error("Requester does not have a verified wallet.");
      }

      const availableBalance = await getEthBalance(payerWalletDoc.address);
      if (Number(requestDoc.amount) > availableBalance) {
        res.status(400);
        throw new Error(
          `Insufficient balance. Available: ${availableBalance.toFixed(4)} ETH.`
        );
      }

      lockedRequest = await ChatRequest.findOneAndUpdate(
        {
          _id: requestId,
          threadId,
          status: "pending",
          targetUserId: req.user._id,
        },
        {
          $set: {
            status: "processing",
            processingAt: new Date(),
          },
        },
        { new: true }
      );

      if (!lockedRequest) {
        res.status(409);
        throw new Error("Request is no longer pending.");
      }

      try {
        await requireAndConsumePaymentCode({
          user: req.user,
          code: req.body?.verificationCode,
        });
      } catch (codeErr) {
        res.status(codeErr?.statusCode || 400);
        throw codeErr;
      }

      txDoc = await Transaction.create({
        senderUserId: req.user._id,
        receiverUserId: lockedRequest.requesterUserId,
        senderWallet: payerWalletDoc.address,
        receiverWallet: requesterWalletDoc.address,
        amount: lockedRequest.amount,
        status: "pending",
        type: "sent",
      });

      const result = await sendRemittance(requesterWalletDoc.address, lockedRequest.amount);

      txDoc.status = "success";
      txDoc.txHash = result.txHash || null;
      await txDoc.save();

      const paidRequest = await ChatRequest.findOneAndUpdate(
        { _id: lockedRequest._id, status: "processing" },
        {
          $set: {
            status: "paid",
            paidAt: new Date(),
            paidByUserId: req.user._id,
            paidTransactionId: txDoc._id,
            paidTxHash: result.txHash || null,
            processingAt: null,
          },
        },
        { new: true }
      );

      if (!paidRequest) {
        res.status(409);
        throw new Error("Request status changed during processing.");
      }

      thread.lastMessageAt = new Date();
      await thread.save();

      try {
        await logAudit({
          user: req.user,
          action: "PAY_CHAT_REQUEST",
          metadata: {
            threadId: String(thread._id),
            requestId: String(paidRequest._id),
            txId: String(txDoc._id),
            amount: paidRequest.amount,
            txHash: txDoc.txHash || null,
          },
          req,
        });
      } catch (auditErr) {
        console.error("Failed to write PAY_CHAT_REQUEST audit log:", auditErr.message);
      }

      res.status(201).json({
        ok: true,
        request: {
          id: paidRequest._id,
          status: paidRequest.status,
          amount: paidRequest.amount,
          note: paidRequest.note || "",
          requesterUserId: paidRequest.requesterUserId,
          targetUserId: paidRequest.targetUserId,
          paidAt: paidRequest.paidAt || null,
          paidByUserId: paidRequest.paidByUserId || null,
          paidTransactionId: paidRequest.paidTransactionId || null,
          paidTxHash: paidRequest.paidTxHash || null,
          cancelledAt: paidRequest.cancelledAt || null,
          cancelledByUserId: paidRequest.cancelledByUserId || null,
          createdAt: paidRequest.createdAt,
        },
        transaction: {
          id: txDoc._id,
          amount: txDoc.amount,
          status: txDoc.status,
          txHash: txDoc.txHash || null,
          senderWallet: txDoc.senderWallet,
          receiverWallet: txDoc.receiverWallet,
          createdAt: txDoc.createdAt,
        },
      });
    } catch (err) {
      if (txDoc && txDoc.status !== "success") {
        txDoc.status = "failed";
        await txDoc.save().catch(() => {});
      }

      if (lockedRequest && lockedRequest.status === "processing") {
        await ChatRequest.updateOne(
          { _id: lockedRequest._id, status: "processing" },
          {
            $set: {
              status: "pending",
              processingAt: null,
            },
          }
        ).catch(() => {});
      }

      next(err);
    }
  }
);

chatRouter.post(
  "/threads/:threadId/requests/:requestId/cancel",
  protect,
  async (req, res, next) => {
    try {
      const threadId = asObjectId(req.params.threadId);
      const requestId = asObjectId(req.params.requestId);

      if (!threadId || !requestId) {
        res.status(400);
        throw new Error("Invalid threadId or requestId.");
      }

      const thread = await ChatThread.findById(threadId);
      if (!thread) {
        res.status(404);
        throw new Error("Chat thread not found.");
      }

      if (!threadContainsUser(thread, req.user._id)) {
        res.status(403);
        throw new Error("You do not have access to this chat thread.");
      }

      const requestDoc = await ChatRequest.findById(requestId);
      if (!requestDoc || String(requestDoc.threadId) !== String(threadId)) {
        res.status(404);
        throw new Error("Request not found in this chat.");
      }

      if (String(requestDoc.requesterUserId) !== String(req.user._id)) {
        res.status(403);
        throw new Error("Only the requester can cancel this request.");
      }

      if (requestDoc.status === "paid") {
        res.status(409);
        throw new Error("Paid requests cannot be cancelled.");
      }

      if (requestDoc.status === "cancelled") {
        return res.json({
          ok: true,
          request: {
            id: requestDoc._id,
            status: requestDoc.status,
            amount: requestDoc.amount,
            note: requestDoc.note || "",
            requesterUserId: requestDoc.requesterUserId,
            targetUserId: requestDoc.targetUserId,
            paidAt: requestDoc.paidAt || null,
            paidByUserId: requestDoc.paidByUserId || null,
            paidTransactionId: requestDoc.paidTransactionId || null,
            paidTxHash: requestDoc.paidTxHash || null,
            cancelledAt: requestDoc.cancelledAt || null,
            cancelledByUserId: requestDoc.cancelledByUserId || null,
            createdAt: requestDoc.createdAt,
          },
        });
      }

      const cancelledRequest = await ChatRequest.findOneAndUpdate(
        {
          _id: requestId,
          threadId,
          status: "pending",
          requesterUserId: req.user._id,
        },
        {
          $set: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelledByUserId: req.user._id,
          },
        },
        { new: true }
      );

      if (!cancelledRequest) {
        res.status(409);
        throw new Error("Request is no longer pending.");
      }

      thread.lastMessageAt = new Date();
      await thread.save();

      try {
        await logAudit({
          user: req.user,
          action: "CANCEL_CHAT_REQUEST",
          metadata: {
            threadId: String(thread._id),
            requestId: String(cancelledRequest._id),
            amount: cancelledRequest.amount,
          },
          req,
        });
      } catch (auditErr) {
        console.error("Failed to write CANCEL_CHAT_REQUEST audit log:", auditErr.message);
      }

      res.json({
        ok: true,
        request: {
          id: cancelledRequest._id,
          status: cancelledRequest.status,
          amount: cancelledRequest.amount,
          note: cancelledRequest.note || "",
          requesterUserId: cancelledRequest.requesterUserId,
          targetUserId: cancelledRequest.targetUserId,
          paidAt: cancelledRequest.paidAt || null,
          paidByUserId: cancelledRequest.paidByUserId || null,
          paidTransactionId: cancelledRequest.paidTransactionId || null,
          paidTxHash: cancelledRequest.paidTxHash || null,
          cancelledAt: cancelledRequest.cancelledAt || null,
          cancelledByUserId: cancelledRequest.cancelledByUserId || null,
          createdAt: cancelledRequest.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

chatRouter.post("/threads/:threadId/report", protect, async (req, res, next) => {
  try {
    const threadId = asObjectId(req.params.threadId);
    if (!threadId) {
      res.status(400);
      throw new Error("Invalid thread id.");
    }

    const thread = await ChatThread.findById(threadId);
    if (!thread) {
      res.status(404);
      throw new Error("Chat thread not found.");
    }

    if (!threadContainsUser(thread, req.user._id)) {
      res.status(403);
      throw new Error("You do not have access to this chat thread.");
    }

    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 5) {
      res.status(400);
      throw new Error("Report reason must be at least 5 characters.");
    }

    const targetUserIdRaw = String(
      req.body?.targetUserId || otherParticipantId(thread, req.user._id) || ""
    );
    const targetUserId = asObjectId(targetUserIdRaw);
    if (!targetUserId || String(targetUserId) === String(req.user._id)) {
      res.status(400);
      throw new Error("targetUserId must be the other participant.");
    }

    if (!threadContainsUser(thread, targetUserId)) {
      res.status(400);
      throw new Error("targetUserId is not part of this thread.");
    }

    const rawRevealedMessages = Array.isArray(req.body?.revealedMessages)
      ? req.body.revealedMessages
      : [];

    if (rawRevealedMessages.length > 30) {
      res.status(400);
      throw new Error("revealedMessages cannot exceed 30 items.");
    }

    const revealedMessages = rawRevealedMessages
      .map((entry) => {
        const messageId = asObjectId(entry?.messageId);
        const plaintext = String(entry?.plaintext || "").trim();
        if (!messageId || !plaintext) return null;
        if (plaintext.length > 4000) return null;
        return { messageId, plaintext };
      })
      .filter(Boolean);

    thread.reports.push({
      reportedByUserId: req.user._id,
      targetUserId,
      reason,
      revealedMessages,
      createdAt: new Date(),
    });
    await thread.save();

    try {
      await logAudit({
        user: req.user,
        action: "REPORT_CHAT_THREAD",
        metadata: {
          threadId: String(thread._id),
          targetUserId: String(targetUserId),
          reasonLength: reason.length,
          revealedMessages: revealedMessages.length,
        },
        req,
      });
    } catch (auditErr) {
      console.error("Failed to write REPORT_CHAT_THREAD audit log:", auditErr.message);
    }

    res.status(201).json({
      ok: true,
      message: "Chat report submitted.",
    });
  } catch (err) {
    next(err);
  }
});
