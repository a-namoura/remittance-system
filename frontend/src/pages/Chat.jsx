import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getCurrentUser } from "../services/authApi.js";
import {
  cancelChatRequest,
  getChatHistory,
  getChatPublicKey,
  listChatFriends,
  openChatThread,
  payChatRequest,
  reportChatThread,
  sendChatTransfer,
  sendChatMessage,
  upsertChatPublicKey,
} from "../services/chatApi.js";
import { getAuthToken } from "../services/session.js";
import {
  getWalletBalance,
  sendPaymentVerificationCode,
} from "../services/transactionApi.js";
import {
  decryptChatPayload,
  encryptForChat,
  getOrCreateChatIdentity,
} from "../utils/chatCrypto.js";
import {
  markChatPeerLatestSeen,
  readChatLastSeenByPeer,
  subscribeChatUnreadUpdates,
} from "../services/chatUnread.js";

function formatClock(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatDay(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatListDay(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function formatAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toFixed(4).replace(/\.?0+$/, "");
}

function getInitials(value) {
  const text = String(value || "").trim();
  if (!text) return "U";
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  const first = parts[0].slice(0, 1);
  const last = parts[parts.length - 1].slice(0, 1);
  return `${first}${last}`.toUpperCase();
}

function getFirstName(value) {
  const text = String(value || "").trim();
  if (!text) return "Friend";
  const parts = text.split(/\s+/).filter(Boolean);
  return parts[0] || "Friend";
}

function requestGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M7 10l5-5 5 5" />
    </svg>
  );
}

function sendGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M7 14l5 5 5-5" />
    </svg>
  );
}

function parseMessagePayload(messageType, plaintext) {
  try {
    const parsed = JSON.parse(String(plaintext || ""));
    if (parsed?.kind === "request") {
      return {
        kind: "request",
        amountEth: String(parsed.amountEth || ""),
        note: String(parsed.note || ""),
      };
    }

    if (parsed?.kind === "text") {
      return {
        kind: "text",
        text: String(parsed.text || ""),
      };
    }
  } catch {
    // fallback below
  }

  if (messageType === "request") {
    return {
      kind: "request",
      amountEth: "",
      note: String(plaintext || ""),
    };
  }

  return {
    kind: "text",
    text: String(plaintext || ""),
  };
}

function requestStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "paid") return "Paid";
  if (normalized === "cancelled") return "Cancelled";
  if (normalized === "processing") return "Processing";
  return "Pending";
}

function createLocalMessageId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toEpochMs(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getFriendLastActivityAt(friend) {
  return (
    friend?.latestMessage?.createdAt ||
    friend?.thread?.lastMessageAt ||
    friend?.createdAt ||
    null
  );
}

const CHAT_SYNC_INTERVAL_MS = 3000;
const CHAT_SYNC_RETRY_MS = 1200;

export default function Chat() {
  const [searchParams] = useSearchParams();
  const requestedFriendId = String(searchParams.get("friend") || "").trim();

  const [me, setMe] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [identityError, setIdentityError] = useState("");

  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState("");
  const [friendSearch, setFriendSearch] = useState("");
  const [friendPreviewByPeer, setFriendPreviewByPeer] = useState({});
  const [unreadStateVersion, setUnreadStateVersion] = useState(0);

  const [activeFriendId, setActiveFriendId] = useState("");
  const [activeThread, setActiveThread] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [timelineInfo, setTimelineInfo] = useState("");
  const [unreadDividerMessageId, setUnreadDividerMessageId] = useState("");
  const [unreadDividerDismissed, setUnreadDividerDismissed] = useState(false);

  const [messages, setMessages] = useState([]);
  const [payments, setPayments] = useState([]);

  const [chatInput, setChatInput] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [requestAmount, setRequestAmount] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendingTransfer, setSendingTransfer] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [composerMode, setComposerMode] = useState("message");
  const [composerActionsOpen, setComposerActionsOpen] = useState(false);

  const [peerPublicKeys, setPeerPublicKeys] = useState({});
  const [reporting, setReporting] = useState(false);
  const [requestedFriendHandled, setRequestedFriendHandled] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);
  const [walletBalanceError, setWalletBalanceError] = useState("");

  const [requestModal, setRequestModal] = useState(null);
  const [requestModalError, setRequestModalError] = useState("");
  const [requestModalInfo, setRequestModalInfo] = useState("");
  const [requestModalLoading, setRequestModalLoading] = useState(false);
  const [paymentCodeSending, setPaymentCodeSending] = useState(false);
  const [paymentCodeChannel, setPaymentCodeChannel] = useState("email");
  const [paymentCodeDestination, setPaymentCodeDestination] = useState("");
  const [paymentCode, setPaymentCode] = useState("");

  const timelineRef = useRef(null);
  const composerActionsRef = useRef(null);
  const historyLoadSeqRef = useRef(0);
  const historySyncTimerRef = useRef(null);
  const historySyncBusyRef = useRef(false);
  const friendSyncTimerRef = useRef(null);
  const friendSyncBusyRef = useRef(false);
  const friendPreviewByMessageRef = useRef({});
  const unreadDividerSeedRef = useRef({
    peerUserId: "",
    seenMessageId: "",
  });

  const activeFriend = useMemo(
    () =>
      friends.find((friend) => String(friend.peerUserId) === String(activeFriendId)) ||
      null,
    [friends, activeFriendId]
  );

  const latestFriends = useMemo(
    () =>
      [...friends].sort(
        (a, b) => toEpochMs(getFriendLastActivityAt(b)) - toEpochMs(getFriendLastActivityAt(a))
      ),
    [friends]
  );

  const searchResults = useMemo(() => {
    const query = friendSearch.trim().toLowerCase();
    if (!query) return [];

    return latestFriends.filter((friend) =>
      [
        friend.label,
        friend.username,
        friend.peerDisplayName,
        friend.peerUsername,
        friend.peerWalletAddress,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [friendSearch, latestFriends]);

  const circleFriends = useMemo(() => {
    const source = friendSearch.trim() ? searchResults : latestFriends;
    return source.slice(0, 8);
  }, [friendSearch, latestFriends, searchResults]);

  const timeline = useMemo(() => {
    const messageEvents = messages.map((message) => ({
      id: `message-${message.id}`,
      kind: "message",
      createdAt: message.createdAt,
      item: message,
    }));

    const paymentEvents = payments.map((payment) => ({
      id: `payment-${payment.id}`,
      kind: "payment",
      createdAt: payment.createdAt,
      item: payment,
    }));

    return [...messageEvents, ...paymentEvents].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [messages, payments]);

  const requestedFriend = useMemo(() => {
    if (!requestedFriendId) return null;
    return (
      friends.find((friend) => String(friend.peerUserId) === String(requestedFriendId)) ||
      null
    );
  }, [friends, requestedFriendId]);
  const activeThreadId = String(activeThread?.id || "").trim();
  const unreadDividerEntryId = unreadDividerMessageId
    ? `message-${String(unreadDividerMessageId)}`
    : "";
  const myWalletAddress = String(me?.wallet?.address || "").trim().toLowerCase();
  const myWalletReady = Boolean(me?.wallet?.linked && myWalletAddress);
  const peerWalletAddress = String(activeFriend?.peerWalletAddress || "")
    .trim()
    .toLowerCase();
  const peerWalletReady = Boolean(peerWalletAddress);
  const transferBlockReason = !myWalletReady
    ? "Link and verify your wallet in Account before using chat transfers."
    : !peerWalletReady
    ? "This friend does not have a linked wallet/account to receive funds."
    : "";

  const friendUnreadByPeer = useMemo(() => {
    void unreadStateVersion;
    const viewerId = String(me?.id || "").trim();
    if (!viewerId) return {};

    const lastSeenByPeer = readChatLastSeenByPeer(viewerId);
    const unreadByPeer = {};

    for (const friend of friends) {
      const peerId = String(friend?.peerUserId || "").trim();
      if (!peerId) continue;

      const latestMessageId = String(friend?.latestMessage?.id || "").trim();
      const latestRecipientId = String(friend?.latestMessage?.recipientUserId || "").trim();
      const seenMessageId = String(lastSeenByPeer[peerId] || "").trim();

      unreadByPeer[peerId] =
        latestMessageId && latestRecipientId === viewerId && latestMessageId !== seenMessageId
          ? 1
          : 0;
    }

    return unreadByPeer;
  }, [friends, me?.id, unreadStateVersion]);

  const refreshWalletBalance = useCallback(async () => {
    const token = getAuthToken();
    const walletAddress = String(me?.wallet?.address || "").trim();
    const walletLinked = Boolean(me?.wallet?.linked && walletAddress);

    if (!token || !walletLinked) {
      setWalletBalance(null);
      setWalletBalanceError(walletLinked ? "Unable to verify wallet balance." : "");
      return null;
    }

    try {
      setWalletBalanceLoading(true);
      setWalletBalanceError("");
      const response = await getWalletBalance({
        token,
        wallet: walletAddress,
      });
      const numericBalance =
        typeof response?.balance === "number" ? response.balance : null;
      setWalletBalance(numericBalance);
      return numericBalance;
    } catch (err) {
      setWalletBalance(null);
      setWalletBalanceError(err.message || "Failed to load wallet balance.");
      return null;
    } finally {
      setWalletBalanceLoading(false);
    }
  }, [me]);

  useEffect(() => {
    let isCancelled = false;

    async function loadPageData() {
      const token = getAuthToken();
      if (!token) {
        if (!isCancelled) {
          setFriendsError("You must be logged in.");
          setFriendsLoading(false);
        }
        return;
      }

      try {
        setFriendsLoading(true);
        setFriendsError("");

        const [meResponse, friendResponse] = await Promise.all([
          getCurrentUser({ token }),
          listChatFriends({ token }),
        ]);

        if (isCancelled) return;
        setMe(meResponse || null);
        setFriends(friendResponse?.friends || []);
      } catch (err) {
        if (isCancelled) return;
        setFriendsError(err.message || "Failed to load chat.");
      } finally {
        if (!isCancelled) {
          setFriendsLoading(false);
        }
      }
    }

    loadPageData();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    friendPreviewByMessageRef.current = {};
    setFriendPreviewByPeer({});
    unreadDividerSeedRef.current = {
      peerUserId: "",
      seenMessageId: "",
    };
    setUnreadDividerMessageId("");
    setUnreadDividerDismissed(false);
    setUnreadStateVersion((value) => value + 1);
  }, [me?.id]);

  useEffect(
    () =>
      subscribeChatUnreadUpdates(() => {
        setUnreadStateVersion((value) => value + 1);
      }),
    []
  );

  useEffect(() => {
    if (!me?.id) return undefined;
    let isCancelled = false;

    async function syncFriends() {
      if (isCancelled) return;
      if (friendSyncBusyRef.current) {
        friendSyncTimerRef.current = window.setTimeout(syncFriends, CHAT_SYNC_RETRY_MS);
        return;
      }

      friendSyncBusyRef.current = true;
      try {
        const token = getAuthToken();
        if (!token) return;
        const response = await listChatFriends({
          token,
          trackRequest: false,
        });
        if (!isCancelled) {
          setFriends(response?.friends || []);
        }
      } catch {
        // silent background sync
      } finally {
        friendSyncBusyRef.current = false;
      }

      if (!isCancelled) {
        friendSyncTimerRef.current = window.setTimeout(syncFriends, CHAT_SYNC_INTERVAL_MS);
      }
    }

    syncFriends();

    return () => {
      isCancelled = true;
      friendSyncBusyRef.current = false;
      if (friendSyncTimerRef.current != null) {
        window.clearTimeout(friendSyncTimerRef.current);
        friendSyncTimerRef.current = null;
      }
    };
  }, [me?.id]);

  useEffect(() => {
    if (!me?.id) return undefined;
    let isCancelled = false;

    const syncNow = async () => {
      if (isCancelled) return;
      if (friendSyncBusyRef.current) return;
      if (document.visibilityState === "hidden") return;
      try {
        const token = getAuthToken();
        if (!token) return;
        const response = await listChatFriends({
          token,
          trackRequest: false,
        });
        if (!isCancelled) {
          setFriends(response?.friends || []);
        }
      } catch {
        // ignore one-off refresh errors
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncNow();
      }
    };

    window.addEventListener("focus", syncNow);
    window.addEventListener("online", syncNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      window.removeEventListener("focus", syncNow);
      window.removeEventListener("online", syncNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [me?.id]);

  useEffect(() => {
    let isCancelled = false;

    async function setupIdentity() {
      if (!me?.id) return;
      const token = getAuthToken();
      if (!token) return;

      try {
        setIdentityError("");
        const createdIdentity = await getOrCreateChatIdentity(me.id);
        if (isCancelled) return;
        setIdentity(createdIdentity);

        await upsertChatPublicKey({
          token,
          publicKeyJwk: createdIdentity.publicKeyJwk,
        });
      } catch (err) {
        if (isCancelled) return;
        setIdentityError(err.message || "Failed to initialize encrypted chat.");
      }
    }

    setupIdentity();

    return () => {
      isCancelled = true;
    };
  }, [me]);

  useEffect(() => {
    refreshWalletBalance();
  }, [refreshWalletBalance]);

  useEffect(() => {
    if (!composerActionsOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!composerActionsRef.current) return;
      if (!composerActionsRef.current.contains(event.target)) {
        setComposerActionsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setComposerActionsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [composerActionsOpen]);

  useEffect(() => {
    setComposerActionsOpen(false);
  }, [activeFriendId]);

  useEffect(() => {
    const peerId = String(activeFriendId || "").trim();
    if (!peerId) {
      setUnreadDividerMessageId("");
      setUnreadDividerDismissed(false);
      return;
    }
    setUnreadDividerMessageId("");
    setUnreadDividerDismissed(false);
  }, [activeFriendId]);

  useEffect(() => {
    const viewerId = String(me?.id || "").trim();
    const peerId = String(activeFriendId || "").trim();
    if (!viewerId || !peerId) return;

    const activeFriendEntry =
      friends.find((friend) => String(friend?.peerUserId || "").trim() === peerId) || null;
    const latestMessageId = String(activeFriendEntry?.latestMessage?.id || "").trim();
    if (!latestMessageId) return;

    markChatPeerLatestSeen({
      userId: viewerId,
      peerUserId: peerId,
      messageId: latestMessageId,
    });
  }, [friends, activeFriendId, me?.id]);

  useEffect(() => {
    if (unreadDividerDismissed) return;
    const viewerId = String(me?.id || "").trim();
    const peerId = String(activeFriendId || "").trim();
    if (!viewerId || !peerId || !messages.length) return;

    const seed = unreadDividerSeedRef.current;
    if (String(seed?.peerUserId || "") !== peerId) return;

    const seenMessageId = String(seed?.seenMessageId || "").trim();
    const seenIndex = seenMessageId
      ? messages.findIndex((message) => String(message?.id || "") === seenMessageId)
      : -1;
    const unreadIncoming = messages.filter((message, index) => {
      if (index <= seenIndex) return false;
      return String(message?.recipientUserId || "").trim() === viewerId;
    });

    if (!unreadIncoming.length) {
      setUnreadDividerMessageId("");
      return;
    }

    const markerMessage =
      seenMessageId && seenIndex === -1
        ? unreadIncoming[unreadIncoming.length - 1]
        : unreadIncoming[0];

    setUnreadDividerMessageId(String(markerMessage?.id || "").trim());
  }, [messages, activeFriendId, me?.id, unreadDividerDismissed]);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateLatestPreviews() {
      if (!identity?.privateKeyJwk) return;
      const updates = {};

      for (const friend of friends) {
        const peerId = String(friend?.peerUserId || "").trim();
        if (!peerId) continue;

        const latestMessage = friend?.latestMessage || null;
        if (!latestMessage?.id) {
          updates[peerId] = "";
          continue;
        }

        const latestMessageId = String(latestMessage.id);
        const cachedPreview = friendPreviewByMessageRef.current[latestMessageId];
        if (cachedPreview) {
          updates[peerId] = cachedPreview;
          continue;
        }

        let preview = "";
        if (latestMessage.messageType === "request") {
          const requestAmount = latestMessage?.request?.amount;
          preview =
            requestAmount != null && requestAmount !== ""
              ? `Request ${formatAmount(requestAmount)} ETH`
              : "Payment request";
        } else {
          try {
            const plaintext = await decryptChatPayload({
              payload: latestMessage.encryptedPayload,
              privateKeyJwk: identity.privateKeyJwk,
              privateKeyJwks: identity.privateKeyJwks,
            });
            const decoded = parseMessagePayload(latestMessage.messageType, plaintext);
            if (decoded.kind === "request") {
              const amount = String(decoded.amountEth || "").trim();
              preview = amount ? `Request ${amount} ETH` : "Payment request";
            } else {
              preview = String(decoded.text || "").trim() || "Message";
            }
          } catch {
            preview =
              latestMessage.messageType === "request"
                ? "Payment request"
                : "Encrypted message";
          }
        }

        friendPreviewByMessageRef.current[latestMessageId] = preview;
        updates[peerId] = preview;
      }

      if (isCancelled) return;
      setFriendPreviewByPeer((current) => ({
        ...current,
        ...updates,
      }));
    }

    hydrateLatestPreviews();

    return () => {
      isCancelled = true;
    };
  }, [friends, identity]);

  async function fetchPeerPublicKey(
    peerUserId,
    { forceRefresh = false, trackRequest = true } = {}
  ) {
    const cached = peerPublicKeys[String(peerUserId)];
    if (cached && !forceRefresh) return cached;

    const token = getAuthToken();
    if (!token) {
      throw new Error("You must be logged in.");
    }

    const response = await getChatPublicKey({
      token,
      userId: peerUserId,
      trackRequest,
    });
    const key = response?.publicKeyJwk || null;
    if (!key) {
      throw new Error("Friend has no chat key.");
    }

    setPeerPublicKeys((current) => ({
      ...current,
      [String(peerUserId)]: key,
    }));

    return key;
  }

  const loadHistory = useCallback(
    async ({
      threadId,
      identityValue,
      silent = false,
      trackRequest = true,
      clearError = true,
    }) => {
      const token = getAuthToken();
      const normalizedThreadId = String(threadId || "").trim();
      if (!token || !normalizedThreadId || !identityValue?.privateKeyJwk) return;
      const loadSeq = ++historyLoadSeqRef.current;

      try {
        if (!silent) {
          setTimelineLoading(true);
        }
        if (clearError) {
          setTimelineError("");
        }

        const history = await getChatHistory({
          token,
          threadId: normalizedThreadId,
          limit: 80,
          trackRequest,
          cacheBust: true,
        });
        const decryptedMessages = await Promise.all(
          (history?.messages || []).map(async (message) => {
            try {
              const plaintext = await decryptChatPayload({
                payload: message.encryptedPayload,
                privateKeyJwk: identityValue.privateKeyJwk,
                privateKeyJwks: identityValue.privateKeyJwks,
              });

              return {
                ...message,
                decoded: parseMessagePayload(message.messageType, plaintext),
              };
            } catch {
              return {
                ...message,
                decoded:
                  message?.messageType === "request"
                    ? {
                        kind: "request",
                        amountEth: String(message?.request?.amount || ""),
                        note: String(message?.request?.note || "Request details unavailable."),
                      }
                    : { kind: "text", text: "Encrypted message unavailable." },
              };
            }
          })
        );

        if (loadSeq !== historyLoadSeqRef.current) return;
        setMessages(decryptedMessages);
        setPayments(history?.payments || []);
        setTimelineInfo(history?.privacyNotice || "");
      } catch (err) {
        if (loadSeq !== historyLoadSeqRef.current) return;
        setTimelineError(err.message || "Failed to load chat timeline.");
      } finally {
        if (!silent && loadSeq === historyLoadSeqRef.current) {
          setTimelineLoading(false);
        }
      }
    },
    []
  );

  const openFriendThread = useCallback(async (friend) => {
    const token = getAuthToken();
    if (!token) {
      setTimelineError("You must be logged in.");
      return;
    }

    if (!identity?.privateKeyJwk) {
      setTimelineError("Encrypted chat is not ready yet.");
      return;
    }

    const openedPeerId = String(friend?.peerUserId || "").trim();
    if (!openedPeerId) return;

    const viewerId = String(me?.id || "").trim();
    const lastSeenByPeer = viewerId ? readChatLastSeenByPeer(viewerId) : {};
    const previouslySeenMessageId = String(lastSeenByPeer[openedPeerId] || "").trim();

    try {
      setTimelineError("");
      historyLoadSeqRef.current += 1;
      unreadDividerSeedRef.current = {
        peerUserId: openedPeerId,
        seenMessageId: previouslySeenMessageId,
      };
      setUnreadDividerDismissed(false);
      setUnreadDividerMessageId("");
      setActiveFriendId(openedPeerId);
      markChatPeerLatestSeen({
        userId: viewerId,
        peerUserId: openedPeerId,
        messageId: friend?.latestMessage?.id,
      });
      setMessages([]);
      setPayments([]);

      const knownThread = friend?.thread || null;
      const knownThreadId = String(knownThread?.id || "").trim();

      if (knownThreadId) {
        setActiveThread(knownThread);
        await loadHistory({
          threadId: knownThreadId,
          identityValue: identity,
          silent: true,
          trackRequest: false,
          clearError: false,
        });
      } else {
        const response = await openChatThread({
          token,
          peerUserId: openedPeerId,
        });

        setActiveThread(response.thread || null);
        await loadHistory({
          threadId: response?.thread?.id,
          identityValue: identity,
          silent: true,
          trackRequest: false,
          clearError: false,
        });
      }
    } catch (err) {
      setTimelineError(err.message || "Failed to open chat thread.");
    }
  }, [identity, loadHistory, me?.id]);

  useEffect(() => {
    if (requestedFriendHandled) return;
    if (!requestedFriendId) {
      setRequestedFriendHandled(true);
      return;
    }
    if (friendsLoading || !identity?.privateKeyJwk) return;
    if (!requestedFriend) {
      setRequestedFriendHandled(true);
      setTimelineError("Requested friend is not in your chat-ready contacts.");
      return;
    }

    openFriendThread(requestedFriend);
    setRequestedFriendHandled(true);
  }, [
    requestedFriendHandled,
    requestedFriendId,
    friendsLoading,
    identity,
    requestedFriend,
    openFriendThread,
  ]);

  useEffect(() => {
    if (!activeThreadId || !identity?.privateKeyJwk) return undefined;
    let isCancelled = false;

    async function syncHistory() {
      if (isCancelled) return;
      if (historySyncBusyRef.current) {
        historySyncTimerRef.current = window.setTimeout(syncHistory, CHAT_SYNC_RETRY_MS);
        return;
      }

      historySyncBusyRef.current = true;
      try {
        await loadHistory({
          threadId: activeThreadId,
          identityValue: identity,
          silent: true,
          trackRequest: false,
          clearError: false,
        });
      } finally {
        historySyncBusyRef.current = false;
      }

      if (!isCancelled) {
        historySyncTimerRef.current = window.setTimeout(syncHistory, CHAT_SYNC_INTERVAL_MS);
      }
    }

    syncHistory();

    return () => {
      isCancelled = true;
      historySyncBusyRef.current = false;
      if (historySyncTimerRef.current != null) {
        window.clearTimeout(historySyncTimerRef.current);
        historySyncTimerRef.current = null;
      }
    };
  }, [activeThreadId, identity, loadHistory]);

  useEffect(() => {
    if (!activeThreadId || !identity?.privateKeyJwk) return undefined;

    const syncNow = () => {
      if (historySyncBusyRef.current) return;
      if (document.visibilityState === "hidden") return;
      loadHistory({
        threadId: activeThreadId,
        identityValue: identity,
        silent: true,
        trackRequest: false,
        clearError: false,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncNow();
      }
    };

    window.addEventListener("focus", syncNow);
    window.addEventListener("online", syncNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", syncNow);
      window.removeEventListener("online", syncNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeThreadId, identity, loadHistory]);

  useEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [timeline, activeThreadId]);

  async function sendEncryptedPayload({
    messageType,
    plaintext,
    requestAmountValue,
    requestNoteValue,
  }) {
    const token = getAuthToken();
    if (!token) {
      setTimelineError("You must be logged in.");
      return false;
    }

    if (!activeThread?.id || !activeFriend?.peerUserId || !identity?.publicKeyJwk) {
      setTimelineError("Select a friend and wait for encrypted chat setup.");
      return false;
    }

    try {
      const peerPublicKey = await fetchPeerPublicKey(activeFriend.peerUserId, {
        forceRefresh: true,
        trackRequest: false,
      });
      const encrypted = await encryptForChat({
        plaintext,
        senderPublicKeyJwk: identity.publicKeyJwk,
        recipientPublicKeyJwk: peerPublicKey,
      });

      await sendChatMessage({
        token,
        threadId: activeThread.id,
        recipientUserId: activeFriend.peerUserId,
        messageType,
        payloadForSender: encrypted.payloadForSender,
        payloadForRecipient: encrypted.payloadForRecipient,
        requestAmount: requestAmountValue,
        requestNote: requestNoteValue,
        trackRequest: false,
      });

      await loadHistory({
        threadId: activeThread.id,
        identityValue: identity,
        silent: true,
        trackRequest: false,
      });
      return true;
    } catch (err) {
      setTimelineError(err.message || "Failed to send message.");
      return false;
    }
  }

  async function handleSendText(event) {
    event.preventDefault();

    const text = chatInput.trim();
    if (!text) return;

    const localMessageId = createLocalMessageId();
    setMessages((current) => [
      ...current,
      {
        id: localMessageId,
        messageType: "text",
        senderUserId: me?.id || "me",
        createdAt: new Date().toISOString(),
        decoded: { kind: "text", text },
        deliveryStatus: "sending",
      },
    ]);

    setSendingMessage(true);
    const sent = await sendEncryptedPayload({
      messageType: "text",
      plaintext: JSON.stringify({ kind: "text", text }),
    });
    setSendingMessage(false);

    if (!sent) {
      setMessages((current) =>
        current.filter((message) => String(message.id) !== String(localMessageId))
      );
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        String(message.id) === String(localMessageId)
          ? { ...message, deliveryStatus: "sent" }
          : message
      )
    );
    setUnreadDividerDismissed(true);
    setUnreadDividerMessageId("");
    setChatInput("");
  }

  async function handleSendRequest(event) {
    event.preventDefault();
    if (transferBlockReason) {
      setTimelineError(transferBlockReason);
      return;
    }
    const amount = Number(requestAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTimelineError("Request amount must be a positive number.");
      return;
    }
    const trimmedNote = requestNote.trim();
    const localMessageId = createLocalMessageId();
    setMessages((current) => [
      ...current,
      {
        id: localMessageId,
        messageType: "request",
        senderUserId: me?.id || "me",
        createdAt: new Date().toISOString(),
        decoded: {
          kind: "request",
          amountEth: String(amount),
          note: trimmedNote,
        },
        request: {
          amount,
          note: trimmedNote,
          requesterUserId: me?.id,
          status: "processing",
        },
        deliveryStatus: "sending",
      },
    ]);
    setSendingRequest(true);
    const sent = await sendEncryptedPayload({
      messageType: "request",
      plaintext: JSON.stringify({
        kind: "request",
        amountEth: String(amount),
        note: trimmedNote,
      }),
      requestAmountValue: amount,
      requestNoteValue: trimmedNote,
    });
    setSendingRequest(false);
    if (!sent) {
      setMessages((current) =>
        current.filter((message) => String(message.id) !== String(localMessageId))
      );
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        String(message.id) === String(localMessageId)
          ? { ...message, deliveryStatus: "sent" }
          : message
      )
    );
    setRequestAmount("");
    setRequestNote("");
  }

  async function handleSendTransfer(event) {
    event.preventDefault();

    if (transferBlockReason) {
      setTimelineError(transferBlockReason);
      return;
    }

    if (!activeThread?.id || !activeFriend?.peerUserId) {
      setTimelineError("Select a friend before sending funds.");
      return;
    }

    const amount = Number(sendAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTimelineError("Send amount must be a positive number.");
      return;
    }

    const normalizedNote = String(sendNote || "").trim();
    if (normalizedNote.length > 280) {
      setTimelineError("Send note cannot exceed 280 characters.");
      return;
    }

    if (!Number.isFinite(walletBalance)) {
      setTimelineError(walletBalanceError || "Unable to verify your balance.");
      return;
    }

    if (amount > walletBalance) {
      setTimelineError(
        `Insufficient balance. Available: ${walletBalance.toFixed(4)} ETH.`
      );
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setTimelineError("You must be logged in.");
      return;
    }

    try {
      setSendingTransfer(true);
      setTimelineError("");
      setTimelineInfo("");
      await sendChatTransfer({
        token,
        threadId: activeThread.id,
        amountEth: amount,
        note: normalizedNote || undefined,
        trackRequest: false,
      });

      setSendAmount("");
      setSendNote("");
      setTimelineInfo("Payment sent.");
      await loadHistory({
        threadId: activeThread.id,
        identityValue: identity,
        silent: true,
        trackRequest: false,
      });
      await refreshWalletBalance();
    } catch (err) {
      setTimelineError(err.message || "Failed to send payment.");
    } finally {
      setSendingTransfer(false);
    }
  }

  async function handleReportChat() {
    if (!activeThread?.id || !activeFriend?.peerUserId) return;
    const reason = window.prompt("Report reason:");
    if (!reason) return;
    const token = getAuthToken();
    if (!token) return;

    try {
      setReporting(true);
      await reportChatThread({
        token,
        threadId: activeThread.id,
        targetUserId: activeFriend.peerUserId,
        reason,
        revealedMessages: [],
      });
      setTimelineInfo("Chat report submitted.");
    } catch (err) {
      setTimelineError(err.message || "Failed to submit report.");
    } finally {
      setReporting(false);
    }
  }

  function closeRequestModal() {
    setRequestModal(null);
    setRequestModalError("");
    setRequestModalInfo("");
    setRequestModalLoading(false);
    setPaymentCodeSending(false);
    setPaymentCodeDestination("");
    setPaymentCode("");
  }

  function openRequestModal(requestData) {
    if (!requestData?.id) return;
    setRequestModal({
      ...requestData,
      isRequester:
        requestData?.isRequester != null
          ? Boolean(requestData.isRequester)
          : String(requestData?.requesterUserId) === String(me?.id),
    });
    setRequestModalError("");
    setRequestModalInfo("");
    setPaymentCode("");
    setPaymentCodeDestination("");
    setPaymentCodeChannel("email");
    refreshWalletBalance();
  }

  async function handleSendPaymentCode() {
    const token = getAuthToken();
    if (!token) {
      setRequestModalError("You must be logged in.");
      return;
    }

    try {
      setPaymentCodeSending(true);
      setRequestModalError("");
      setRequestModalInfo("");
      const response = await sendPaymentVerificationCode({
        token,
        verificationChannel: paymentCodeChannel,
      });
      setPaymentCodeDestination(String(response?.destination || "").trim());
      setRequestModalInfo(
        `Verification code sent via ${response?.verificationChannel || paymentCodeChannel}.`
      );
    } catch (err) {
      setRequestModalError(err.message || "Failed to send verification code.");
    } finally {
      setPaymentCodeSending(false);
    }
  }

  async function handlePayRequestFromModal() {
    if (!requestModal?.id || !activeThread?.id) return;

    const amount = Number(requestModal.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRequestModalError("Invalid request amount.");
      return;
    }

    if (!Number.isFinite(walletBalance)) {
      setRequestModalError(walletBalanceError || "Unable to verify your balance.");
      return;
    }

    if (amount > walletBalance) {
      setRequestModalError(
        `Insufficient balance. Available: ${walletBalance.toFixed(4)} ETH.`
      );
      return;
    }

    const normalizedCode = String(paymentCode || "").trim();
    if (normalizedCode.length < 6) {
      setRequestModalError("Enter the 6-digit verification code to continue.");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setRequestModalError("You must be logged in.");
      return;
    }

    try {
      setRequestModalLoading(true);
      setRequestModalError("");
      setRequestModalInfo("");
      const response = await payChatRequest({
        token,
        threadId: activeThread.id,
        requestId: requestModal.id,
        verificationCode: normalizedCode,
      });
      setRequestModal((current) =>
        current
          ? {
              ...current,
              ...(response?.request || {}),
            }
          : current
      );
      setPaymentCode("");
      setPaymentCodeDestination("");
      setRequestModalInfo("Payment sent successfully.");
      await loadHistory({
        threadId: activeThread.id,
        identityValue: identity,
        silent: true,
      });
      await refreshWalletBalance();
    } catch (err) {
      setRequestModalError(err.message || "Failed to send payment for request.");
    } finally {
      setRequestModalLoading(false);
    }
  }

  async function handleCancelRequestFromModal() {
    if (!requestModal?.id || !activeThread?.id) return;
    const token = getAuthToken();
    if (!token) {
      setRequestModalError("You must be logged in.");
      return;
    }

    try {
      setRequestModalLoading(true);
      setRequestModalError("");
      setRequestModalInfo("");
      const response = await cancelChatRequest({
        token,
        threadId: activeThread.id,
        requestId: requestModal.id,
      });
      setRequestModal((current) =>
        current
          ? {
              ...current,
              ...(response?.request || {}),
            }
          : current
      );
      setRequestModalInfo("Request cancelled.");
      await loadHistory({
        threadId: activeThread.id,
        identityValue: identity,
        silent: true,
      });
    } catch (err) {
      setRequestModalError(err.message || "Failed to cancel request.");
    } finally {
      setRequestModalLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[92rem] px-4 py-6 sm:px-6 sm:py-8">
      {(friendsError || identityError || timelineError) && (
        <div className="mb-3 space-y-2">
          {friendsError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {friendsError}
            </div>
          )}
          {identityError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {identityError}
            </div>
          )}
          {timelineError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {timelineError}
            </div>
          )}
        </div>
      )}

      <section className="rounded-[2rem] border border-gray-200 bg-white p-3 shadow-sm sm:p-4 md:h-[calc(100vh-9.5rem)]">
        <div className="grid gap-3 md:h-full md:grid-cols-[minmax(300px,_0.85fr)_minmax(0,_1.45fr)]">
          <aside className="flex min-h-[36rem] flex-col rounded-3xl border border-gray-200 bg-gray-50 p-4 md:h-full md:min-h-0">
            <div>
              <label className="sr-only" htmlFor="chat-friend-search">
                Search friends
              </label>
              <input
                id="chat-friend-search"
                type="text"
                value={friendSearch}
                onChange={(event) => setFriendSearch(event.target.value)}
                placeholder="Search contacts"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-purple-400"
              />
            </div>

            {friendSearch.trim() ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Search results
                </p>
                <div className="space-y-2">
                  {friendsLoading ? (
                    <p className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-500">
                      Searching...
                    </p>
                  ) : searchResults.length === 0 ? (
                    <p className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-500">
                      No contacts found.
                    </p>
                  ) : (
                    searchResults.slice(0, 6).map((friend) => {
                      const active = String(activeFriendId) === String(friend.peerUserId);
                      const displayName = friend.label || friend.peerDisplayName || "Friend";
                      const username = friend.peerUsername || friend.username || "friend";
                      return (
                        <button
                          key={`search-${String(friend.peerUserId)}`}
                          type="button"
                          onClick={() => openFriendThread(friend)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                            active
                              ? "border-purple-300 bg-purple-50"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-600/90 text-xs font-semibold text-white">
                              {getInitials(displayName)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {displayName}
                              </p>
                              <p className="truncate text-xs text-gray-500">@{username}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                Contacts
              </p>
              <div className="mt-2 flex gap-3 overflow-x-auto py-1">
                {friendsLoading ? (
                  <p className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                    Loading contacts...
                  </p>
                ) : circleFriends.length === 0 ? (
                  <p className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                    No contacts yet.
                  </p>
                ) : (
                  circleFriends.map((friend) => {
                    const active = String(activeFriendId) === String(friend.peerUserId);
                    const displayName = friend.label || friend.peerDisplayName || "Friend";
                    const peerId = String(friend.peerUserId || "");
                    const unreadCount = Number(friendUnreadByPeer[peerId] || 0);
                    return (
                      <button
                        key={`circle-${String(friend.peerUserId)}`}
                        type="button"
                        onClick={() => openFriendThread(friend)}
                        className="group flex w-16 shrink-0 flex-col items-center"
                      >
                        <span
                          className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-white transition ${
                            active
                              ? "bg-purple-700"
                              : "bg-purple-600/90 group-hover:bg-purple-700"
                          } relative`}
                        >
                          {getInitials(displayName)}
                          {unreadCount > 0 ? (
                            <span className="absolute right-0 top-0 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white shadow-sm ring-2 ring-white">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1 w-full truncate text-center text-xs text-gray-700">
                          {getFirstName(displayName)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 min-h-0 flex-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                Latest messages
              </p>
              <div className="h-full space-y-2 overflow-y-auto pr-1">
                {friendsLoading ? (
                  <p className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-500">
                    Loading messages...
                  </p>
                ) : latestFriends.length === 0 ? (
                  <p className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-500">
                    You have no messages yet.
                  </p>
                ) : (
                  latestFriends.map((friend) => {
                    const active = String(activeFriendId) === String(friend.peerUserId);
                    const displayName = friend.label || friend.peerDisplayName || "Friend";
                    const username = friend.peerUsername || friend.username || "friend";
                    const peerId = String(friend.peerUserId || "");
                    const unreadCount = Number(friendUnreadByPeer[peerId] || 0);
                    const latestPreview = String(friendPreviewByPeer[peerId] || "").trim();
                    const hasLatestMessage = Boolean(friend?.latestMessage?.id);
                    const lastActivityAt = getFriendLastActivityAt(friend);
                    const isLatestMine =
                      String(friend?.latestMessage?.senderUserId || "").trim() ===
                      String(me?.id || "").trim();
                    const previewLine = hasLatestMessage
                      ? `${isLatestMine ? "You: " : ""}${latestPreview || "New message"}`
                      : "No messages yet.";
                    return (
                      <button
                        key={`latest-${String(friend.peerUserId)}`}
                        type="button"
                        onClick={() => openFriendThread(friend)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                          active
                            ? "border-purple-300 bg-purple-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-600/90 text-xs font-semibold text-white">
                            {getInitials(displayName)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {displayName}
                              </p>
                              <div className="flex shrink-0 items-center gap-2">
                                {unreadCount > 0 ? (
                                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                    {unreadCount > 99 ? "99+" : unreadCount}
                                  </span>
                                ) : null}
                                <p className="text-[11px] text-gray-500">
                                  {formatListDay(lastActivityAt)}
                                </p>
                              </div>
                            </div>
                            <p className="truncate text-xs text-gray-500">@{username}</p>
                            <p className="mt-0.5 truncate text-xs text-gray-600">{previewLine}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          <section className="flex min-h-[36rem] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white md:h-full md:min-h-0">
            {!activeFriend ? (
              <div className="h-full min-h-[36rem] bg-white md:min-h-0" />
            ) : (
              <>
                <header className="border-b border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-semibold text-white">
                        {getInitials(activeFriend.peerDisplayName || activeFriend.label)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {activeFriend.peerDisplayName || activeFriend.label}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          @{activeFriend.peerUsername || activeFriend.username}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleReportChat}
                      disabled={reporting}
                      className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                    >
                      {reporting ? "Reporting..." : "Report"}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    {timelineInfo ||
                      "Messages are encrypted end-to-end. Payment events remain visible to the system."}
                  </p>
                </header>

                <div
                  ref={timelineRef}
                  className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-white px-4 py-4 sm:px-6"
                >
                  {timelineLoading && timeline.length === 0 ? (
                    <p className="text-sm text-gray-500">Loading messages...</p>
                  ) : timeline.length === 0 ? (
                    <p className="text-sm text-gray-500">No messages yet in this conversation.</p>
                  ) : (
                    timeline.map((entry, index) => {
                      const previous = timeline[index - 1];
                      const showDate =
                        !previous ||
                        formatDay(previous.createdAt) !== formatDay(entry.createdAt);
                      const showUnreadDivider =
                        !unreadDividerDismissed &&
                        Boolean(unreadDividerEntryId) &&
                        entry.id === unreadDividerEntryId;

                      if (entry.kind === "payment") {
                        const payment = entry.item;
                        const isSent = payment.direction === "sent";
                        return (
                          <div key={entry.id} className="space-y-2">
                            {showDate && (
                              <div className="text-center text-[11px] font-medium text-gray-500">
                                {formatDay(entry.createdAt)}
                              </div>
                            )}
                            <div className={`flex ${isSent ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`max-w-[18rem] rounded-2xl border px-4 py-3 shadow-sm ${
                                  isSent
                                    ? "border-purple-200 bg-purple-50"
                                    : "border-gray-200 bg-gray-100"
                                }`}
                              >
                                <p
                                  className={`text-xs font-medium ${
                                    isSent ? "text-purple-700" : "text-gray-700"
                                  }`}
                                >
                                  {isSent ? "\u2197 You sent" : "\u2198 You received"}
                                </p>
                                <p
                                  className={`mt-1 text-2xl font-semibold leading-none ${
                                    isSent ? "text-purple-800" : "text-gray-900"
                                  }`}
                                >
                                  {formatAmount(payment.amount)}{" "}
                                  {String(payment.assetSymbol || "ETH").trim().toUpperCase()}
                                </p>
                                {payment.note ? (
                                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                                    {payment.note}
                                  </p>
                                ) : null}
                                <p className="mt-2 text-xs text-gray-600">
                                  {formatClock(payment.createdAt)} | {payment.status}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const message = entry.item;
                      const isMine = String(message.senderUserId) === String(me?.id);
                      const isSendingMessage =
                        String(message.deliveryStatus || "").trim().toLowerCase() === "sending";
                      const decoded = message.decoded || { kind: "text", text: "" };
                      const requestMeta = message.request || null;
                      const requestStatus = String(requestMeta?.status || "pending")
                        .trim()
                        .toLowerCase();
                      const requestAmountValue =
                        requestMeta?.amount != null ? requestMeta.amount : decoded.amountEth;
                      const requestNoteValue =
                        requestMeta?.note != null ? requestMeta.note : decoded.note;
                      const requesterUserId =
                        requestMeta?.requesterUserId || message.senderUserId;
                      const requesterIsMe = String(requesterUserId) === String(me?.id);
                      const friendName =
                        activeFriend?.peerDisplayName || activeFriend?.label || "Friend";
                      const hasRequestActions = Boolean(requestMeta?.id);
                      const showRequestActionButton =
                        decoded.kind === "request" &&
                        hasRequestActions &&
                        requestStatus === "pending";
                      const avatarInitials = getInitials(friendName);
                      const handleOpenRequest = () =>
                        openRequestModal({
                          ...requestMeta,
                          amount: requestAmountValue,
                          note: requestNoteValue,
                          friendName,
                          isRequester: requesterIsMe,
                        });

                      return (
                        <div key={entry.id} className="space-y-2">
                          {showDate && (
                            <div className="text-center text-[11px] font-medium text-gray-500">
                              {formatDay(entry.createdAt)}
                            </div>
                          )}
                          {showUnreadDivider ? (
                            <div className="flex items-center gap-2 py-1">
                              <span className="h-px flex-1 bg-purple-200" />
                              <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-purple-700">
                                Unread messages
                              </span>
                              <span className="h-px flex-1 bg-purple-200" />
                            </div>
                          ) : null}
                          <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                            {!isMine ? (
                              <span className="mr-2 mt-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-[11px] font-semibold text-white">
                                {avatarInitials}
                              </span>
                            ) : null}
                            <div
                              onClick={
                                decoded.kind === "request" && hasRequestActions
                                  ? handleOpenRequest
                                  : undefined
                              }
                              className={`max-w-[76%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                isMine
                                  ? "bg-purple-600 text-white"
                                  : "border border-gray-200 bg-gray-100 text-gray-900"
                              } ${
                                decoded.kind === "request" && hasRequestActions
                                  ? "cursor-pointer"
                                  : ""
                              }`}
                            >
                              {decoded.kind === "request" ? (
                                <div>
                                  <p
                                    className={`text-[11px] uppercase tracking-[0.14em] ${
                                      isMine ? "text-purple-100" : "text-gray-500"
                                    }`}
                                  >
                                    {requesterIsMe ? "Payment request" : `Request from ${friendName}`}
                                  </p>
                                  {requestAmountValue ? (
                                    <p className="mt-1 text-xl font-semibold">
                                      {formatAmount(requestAmountValue)} ETH
                                    </p>
                                  ) : null}
                                  {requestNoteValue ? (
                                    <p className="mt-1 whitespace-pre-wrap text-sm">
                                      {requestNoteValue}
                                    </p>
                                  ) : (
                                    <p
                                      className={`mt-1 text-sm ${
                                        isMine ? "text-purple-100" : "text-gray-600"
                                      }`}
                                    >
                                      Request created in chat.
                                    </p>
                                  )}
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <p
                                      className={`text-[11px] font-semibold ${
                                        isMine ? "text-purple-100" : "text-gray-600"
                                      }`}
                                    >
                                      {requestStatusLabel(requestStatus)}
                                    </p>
                                    {showRequestActionButton ? (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleOpenRequest();
                                        }}
                                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                                          isMine
                                            ? "bg-purple-200 text-purple-800"
                                            : "bg-purple-600 text-white"
                                        }`}
                                      >
                                        {requesterIsMe ? "Cancel request" : "Send"}
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap break-words">{decoded.text}</p>
                              )}
                              <p
                                className={`mt-2 text-[11px] ${
                                  isMine ? "text-purple-100" : "text-gray-500"
                                }`}
                              >
                                {isSendingMessage ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <svg
                                      aria-hidden="true"
                                      className="h-3 w-3 animate-spin"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <circle
                                        cx="12"
                                        cy="12"
                                        r="9"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        className="opacity-30"
                                      />
                                      <path
                                        d="M21 12a9 9 0 0 0-9-9"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                    <span>Sending...</span>
                                  </span>
                                ) : (
                                  formatClock(message.createdAt)
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-gray-200 bg-gray-50 px-3 py-3 sm:px-4">
                  {composerMode !== "message" && transferBlockReason ? (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {transferBlockReason}
                    </div>
                  ) : null}

                  {composerMode === "send" ? (
                    <form
                      onSubmit={handleSendTransfer}
                      className="grid gap-2 sm:grid-cols-[150px,1fr,auto]"
                    >
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        required
                        value={sendAmount}
                        onChange={(event) => setSendAmount(event.target.value)}
                        placeholder="Amount ETH"
                        className="w-full rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-purple-400"
                      />
                      <input
                        type="text"
                        value={sendNote}
                        onChange={(event) => setSendNote(event.target.value)}
                        placeholder="Send note (optional)"
                        className="w-full rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-purple-400"
                      />
                      <button
                        type="submit"
                        disabled={
                          sendingTransfer ||
                          Boolean(transferBlockReason) ||
                          !activeThread?.id ||
                          !sendAmount.trim() ||
                          !identity?.publicKeyJwk
                        }
                        className="rounded-full bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                      >
                        {sendingTransfer ? "Sending..." : "Send now"}
                      </button>
                    </form>
                  ) : null}

                  {composerMode === "request" ? (
                    <form
                      onSubmit={handleSendRequest}
                      className="grid gap-2 sm:grid-cols-[150px,1fr,auto]"
                    >
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        required
                        value={requestAmount}
                        onChange={(event) => setRequestAmount(event.target.value)}
                        placeholder="Amount ETH"
                        className="w-full rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-purple-400"
                      />
                      <input
                        type="text"
                        value={requestNote}
                        onChange={(event) => setRequestNote(event.target.value)}
                        placeholder="Request note (optional)"
                        className="w-full rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-purple-400"
                      />
                      <button
                        type="submit"
                        disabled={
                          sendingRequest ||
                          Boolean(transferBlockReason) ||
                          !activeThread?.id ||
                          !identity?.publicKeyJwk
                        }
                        className="rounded-full bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                      >
                        {sendingRequest ? "Requesting..." : "Request"}
                      </button>
                    </form>
                  ) : null}

                  <div
                    ref={composerActionsRef}
                    className={`relative ${composerMode === "message" ? "" : "mt-3"}`}
                  >
                    {composerActionsOpen ? (
                      <div className="absolute bottom-full left-0 z-20 mb-2 w-52 rounded-2xl border border-gray-200 bg-white p-2 shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            setComposerMode((current) =>
                              current === "request" ? "message" : "request"
                            );
                            setComposerActionsOpen(false);
                          }}
                          className={`inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                            composerMode === "request"
                              ? "bg-purple-100 text-purple-700"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          {requestGlyph()}
                          Request
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setComposerMode((current) =>
                              current === "send" ? "message" : "send"
                            );
                            setComposerActionsOpen(false);
                          }}
                          className={`mt-1 inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                            composerMode === "send"
                              ? "bg-purple-100 text-purple-700"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          {sendGlyph()}
                          Send
                        </button>
                      </div>
                    ) : null}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setComposerActionsOpen((current) => !current)}
                        aria-expanded={composerActionsOpen}
                        aria-haspopup="menu"
                        className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
                          composerActionsOpen
                            ? "border-purple-300 bg-purple-100 text-purple-700"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <svg
                          aria-hidden="true"
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M12 5V19M5 12H19"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                        {composerActionsOpen ? "Hide" : "Actions"}
                      </button>
                      <form onSubmit={handleSendText} className="flex min-w-0 flex-1 gap-2">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(event) => setChatInput(event.target.value)}
                          placeholder="Type a message..."
                          className="min-w-0 flex-1 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-purple-400"
                        />
                        <button
                          type="submit"
                          disabled={
                            sendingMessage ||
                            !activeThread?.id ||
                            !chatInput.trim() ||
                            !identity?.publicKeyJwk
                          }
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-purple-600 text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                        >
                          {sendingMessage ? (
                            <svg
                              aria-hidden="true"
                              className="h-5 w-5 animate-spin"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="3"
                                className="opacity-30"
                              />
                              <path
                                d="M22 12a10 10 0 0 0-10-10"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                              />
                            </svg>
                          ) : (
                            <svg
                              aria-hidden="true"
                              className="h-5 w-5"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M3 11.5L21 3L14 21L11 13L3 11.5Z"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                          <span className="sr-only">
                            {sendingMessage ? "Sending message..." : "Send message"}
                          </span>
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </section>

      {requestModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Request details</h3>

            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
              <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Friend</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {requestModal.friendName || activeFriend?.peerDisplayName || activeFriend?.label}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.12em] text-gray-500">Amount</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {formatAmount(requestModal.amount)} ETH
              </p>
              {requestModal.note ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{requestModal.note}</p>
              ) : null}
              <p className="mt-2 text-xs font-semibold text-gray-600">
                Status: {requestStatusLabel(requestModal.status)}
              </p>
            </div>

            {requestModalInfo ? (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {requestModalInfo}
              </p>
            ) : null}
            {requestModalError ? (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {requestModalError}
              </p>
            ) : null}

            {!requestModal.isRequester &&
            String(requestModal.status || "").trim().toLowerCase() === "pending" ? (
              <div className="mt-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-[1fr,auto]">
                  <select
                    value={paymentCodeChannel}
                    onChange={(event) => setPaymentCodeChannel(event.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-gray-400 focus:outline-none"
                  >
                    <option value="email">Email</option>
                    {String(me?.phoneNumber || "").trim() ? (
                      <option value="phone">Phone</option>
                    ) : null}
                  </select>
                  <button
                    type="button"
                    onClick={handleSendPaymentCode}
                    disabled={paymentCodeSending}
                    className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {paymentCodeSending ? "Sending code..." : "Send code"}
                  </button>
                </div>

                {paymentCodeDestination ? (
                  <p className="text-xs text-gray-600">
                    Code sent to <span className="font-semibold">{paymentCodeDestination}</span>
                  </p>
                ) : null}

                <input
                  type="text"
                  value={paymentCode}
                  onChange={(event) =>
                    setPaymentCode(String(event.target.value || "").replace(/\D/g, ""))
                  }
                  maxLength={6}
                  placeholder="6-digit verification code"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tracking-[0.2em] text-gray-900 focus:border-gray-400 focus:outline-none"
                />

                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  {walletBalanceLoading ? (
                    <p className="text-xs text-gray-500">Checking balance...</p>
                  ) : Number.isFinite(walletBalance) ? (
                    <p className="text-xs text-gray-600">
                      Available balance:{" "}
                      <span className="font-semibold text-gray-900">
                        {walletBalance.toFixed(4)} ETH
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-red-600">
                      {walletBalanceError || "Balance unavailable."}
                    </p>
                  )}
                </div>

                {Number.isFinite(walletBalance) &&
                Number(requestModal.amount) > Number(walletBalance) ? (
                  <p className="text-xs font-medium text-red-600">
                    Amount exceeds your available balance.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              {requestModal.isRequester &&
              String(requestModal.status || "").trim().toLowerCase() === "pending" ? (
                <button
                  type="button"
                  onClick={handleCancelRequestFromModal}
                  disabled={requestModalLoading}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {requestModalLoading ? "Cancelling..." : "Cancel request"}
                </button>
              ) : null}

              {!requestModal.isRequester &&
              String(requestModal.status || "").trim().toLowerCase() === "pending" ? (
                <button
                  type="button"
                  onClick={handlePayRequestFromModal}
                  disabled={
                    requestModalLoading ||
                    walletBalanceLoading ||
                    !Number.isFinite(walletBalance) ||
                    Number(requestModal.amount) > Number(walletBalance) ||
                    String(paymentCode || "").trim().length < 6
                  }
                  className="rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
                >
                  {requestModalLoading ? "Sending..." : "Send"}
                </button>
              ) : null}

              <button
                type="button"
                onClick={closeRequestModal}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
