const CHAT_LAST_SEEN_PREFIX = "chatLastSeenByPeer_";
const CHAT_UNREAD_EVENT = "remittance:chat-unread-updated";

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getLastSeenStorageKey(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;
  return `${CHAT_LAST_SEEN_PREFIX}${normalizedUserId}`;
}

function readRawJson(key) {
  const storage = getStorage();
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeRawJson(key, value) {
  const storage = getStorage();
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

function normalizeLastSeenMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized = {};
  for (const [peerUserId, messageId] of Object.entries(value)) {
    const normalizedPeerUserId = String(peerUserId || "").trim();
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedPeerUserId || !normalizedMessageId) continue;
    normalized[normalizedPeerUserId] = normalizedMessageId;
  }
  return normalized;
}

function emitChatUnreadUpdated(detail) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(CHAT_UNREAD_EVENT, {
        detail: detail || {},
      })
    );
  } catch {
    // ignore event dispatch failures
  }
}

export function readChatLastSeenByPeer(userId) {
  const key = getLastSeenStorageKey(userId);
  return normalizeLastSeenMap(readRawJson(key));
}

export function markChatPeerLatestSeen({ userId, peerUserId, messageId } = {}) {
  const key = getLastSeenStorageKey(userId);
  const normalizedPeerUserId = String(peerUserId || "").trim();
  const normalizedMessageId = String(messageId || "").trim();

  if (!key || !normalizedPeerUserId || !normalizedMessageId) {
    return false;
  }

  const current = readChatLastSeenByPeer(userId);
  if (String(current[normalizedPeerUserId] || "") === normalizedMessageId) {
    return false;
  }

  const next = {
    ...current,
    [normalizedPeerUserId]: normalizedMessageId,
  };

  writeRawJson(key, next);
  emitChatUnreadUpdated({
    userId: String(userId || "").trim(),
    peerUserId: normalizedPeerUserId,
    messageId: normalizedMessageId,
  });
  return true;
}

export function countUnreadConversations({ friends, viewerUserId } = {}) {
  const normalizedViewerUserId = String(viewerUserId || "").trim();
  if (!normalizedViewerUserId) return 0;

  const lastSeenByPeer = readChatLastSeenByPeer(normalizedViewerUserId);
  const safeFriends = Array.isArray(friends) ? friends : [];

  let totalUnread = 0;
  for (const friend of safeFriends) {
    const peerUserId = String(friend?.peerUserId || "").trim();
    const latestMessageId = String(friend?.latestMessage?.id || "").trim();
    const latestRecipientUserId = String(friend?.latestMessage?.recipientUserId || "").trim();

    if (!peerUserId || !latestMessageId) continue;
    if (latestRecipientUserId !== normalizedViewerUserId) continue;

    const seenMessageId = String(lastSeenByPeer[peerUserId] || "").trim();
    if (seenMessageId !== latestMessageId) {
      totalUnread += 1;
    }
  }

  return totalUnread;
}

export function subscribeChatUnreadUpdates(handler) {
  if (typeof window === "undefined" || typeof handler !== "function") {
    return () => {};
  }

  const wrapped = (event) => {
    handler(event?.detail || {});
  };

  window.addEventListener(CHAT_UNREAD_EVENT, wrapped);
  return () => {
    window.removeEventListener(CHAT_UNREAD_EVENT, wrapped);
  };
}
