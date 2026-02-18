import { apiRequest } from "./api.js";

export async function listChatFriends({ token, trackRequest = true } = {}) {
  return apiRequest("/api/chats/friends", { token, trackRequest });
}

export async function upsertChatPublicKey({ token, publicKeyJwk } = {}) {
  return apiRequest("/api/chats/keys/public", {
    method: "PUT",
    token,
    body: { publicKeyJwk },
  });
}

export async function getChatPublicKey({ token, userId, trackRequest = true } = {}) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("userId is required");
  }

  return apiRequest(`/api/chats/keys/${encodeURIComponent(normalizedUserId)}`, {
    token,
    trackRequest,
  });
}

export async function openChatThread({ token, peerUserId } = {}) {
  const normalizedPeerUserId = String(peerUserId || "").trim();
  if (!normalizedPeerUserId) {
    throw new Error("peerUserId is required");
  }

  return apiRequest(
    `/api/chats/threads/${encodeURIComponent(normalizedPeerUserId)}`,
    { token }
  );
}

export async function getChatHistory({
  token,
  threadId,
  limit = 120,
  trackRequest = true,
  cacheBust = true,
} = {}) {
  const normalizedThreadId = String(threadId || "").trim();
  if (!normalizedThreadId) {
    throw new Error("threadId is required");
  }

  const params = new URLSearchParams();
  const numericLimit = Number(limit);
  if (Number.isFinite(numericLimit) && numericLimit > 0) {
    params.set("limit", String(Math.floor(numericLimit)));
  }
  if (cacheBust) {
    params.set("_ts", String(Date.now()));
  }

  const path =
    params.toString().length > 0
      ? `/api/chats/threads/${encodeURIComponent(
          normalizedThreadId
        )}/history?${params.toString()}`
      : `/api/chats/threads/${encodeURIComponent(normalizedThreadId)}/history`;

  return apiRequest(path, { token, trackRequest });
}

export async function sendChatMessage({
  token,
  threadId,
  recipientUserId,
  messageType,
  payloadForSender,
  payloadForRecipient,
  requestAmount,
  requestNote,
  trackRequest = true,
} = {}) {
  const normalizedThreadId = String(threadId || "").trim();
  if (!normalizedThreadId) {
    throw new Error("threadId is required");
  }

  return apiRequest(
    `/api/chats/threads/${encodeURIComponent(normalizedThreadId)}/messages`,
    {
      method: "POST",
      token,
      body: {
        recipientUserId,
        messageType,
        payloadForSender,
        payloadForRecipient,
        requestAmount,
        requestNote,
      },
      trackRequest,
    }
  );
}

export async function sendChatTransfer({
  token,
  threadId,
  amountEth,
  note,
  trackRequest = true,
} = {}) {
  const normalizedThreadId = String(threadId || "").trim();
  if (!normalizedThreadId) {
    throw new Error("threadId is required");
  }

  return apiRequest(
    `/api/chats/threads/${encodeURIComponent(normalizedThreadId)}/send`,
    {
      method: "POST",
      token,
      body: {
        amountEth,
        note,
      },
      trackRequest,
    }
  );
}

export async function payChatRequest({
  token,
  threadId,
  requestId,
  verificationCode,
} = {}) {
  const normalizedThreadId = String(threadId || "").trim();
  const normalizedRequestId = String(requestId || "").trim();
  if (!normalizedThreadId || !normalizedRequestId) {
    throw new Error("threadId and requestId are required");
  }

  return apiRequest(
    `/api/chats/threads/${encodeURIComponent(
      normalizedThreadId
    )}/requests/${encodeURIComponent(normalizedRequestId)}/pay`,
    {
      method: "POST",
      token,
      body: { verificationCode },
    }
  );
}

export async function cancelChatRequest({ token, threadId, requestId } = {}) {
  const normalizedThreadId = String(threadId || "").trim();
  const normalizedRequestId = String(requestId || "").trim();
  if (!normalizedThreadId || !normalizedRequestId) {
    throw new Error("threadId and requestId are required");
  }

  return apiRequest(
    `/api/chats/threads/${encodeURIComponent(
      normalizedThreadId
    )}/requests/${encodeURIComponent(normalizedRequestId)}/cancel`,
    {
      method: "POST",
      token,
    }
  );
}

export async function reportChatThread({
  token,
  threadId,
  targetUserId,
  reason,
  revealedMessages,
} = {}) {
  const normalizedThreadId = String(threadId || "").trim();
  if (!normalizedThreadId) {
    throw new Error("threadId is required");
  }

  return apiRequest(
    `/api/chats/threads/${encodeURIComponent(normalizedThreadId)}/report`,
    {
      method: "POST",
      token,
      body: {
        targetUserId,
        reason,
        revealedMessages,
      },
    }
  );
}
