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

  const [activeFriendId, setActiveFriendId] = useState("");
  const [activeThread, setActiveThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [timelineInfo, setTimelineInfo] = useState("");

  const [messages, setMessages] = useState([]);
  const [payments, setPayments] = useState([]);

  const [chatInput, setChatInput] = useState("");
  const [requestAmount, setRequestAmount] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [composerMode, setComposerMode] = useState("message");

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

  const activeFriend = useMemo(
    () =>
      friends.find((friend) => String(friend.peerUserId) === String(activeFriendId)) ||
      null,
    [friends, activeFriendId]
  );

  const latestFriends = useMemo(
    () =>
      [...friends].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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

  async function fetchPeerPublicKey(peerUserId, { forceRefresh = false } = {}) {
    const cached = peerPublicKeys[String(peerUserId)];
    if (cached && !forceRefresh) return cached;

    const token = getAuthToken();
    if (!token) {
      throw new Error("You must be logged in.");
    }

    const response = await getChatPublicKey({ token, userId: peerUserId });
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

  async function loadHistory({ threadId, identityValue, silent = false }) {
    const token = getAuthToken();
    if (!token || !threadId || !identityValue?.privateKeyJwk) return;

    try {
      if (!silent) {
        setTimelineLoading(true);
      }
      setTimelineError("");

      const history = await getChatHistory({ token, threadId, limit: 180 });
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

      setMessages(decryptedMessages);
      setPayments(history?.payments || []);
      setTimelineInfo(history?.privacyNotice || "");
    } catch (err) {
      setTimelineError(err.message || "Failed to load chat timeline.");
    } finally {
      if (!silent) {
        setTimelineLoading(false);
      }
    }
  }

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

    try {
      setThreadLoading(true);
      setTimelineError("");
      setActiveFriendId(String(friend.peerUserId));
      setMessages([]);
      setPayments([]);

      const response = await openChatThread({
        token,
        peerUserId: friend.peerUserId,
      });

      setActiveThread(response.thread || null);
      await loadHistory({
        threadId: response?.thread?.id,
        identityValue: identity,
      });
    } catch (err) {
      setTimelineError(err.message || "Failed to open chat thread.");
    } finally {
      setThreadLoading(false);
    }
  }, [identity]);

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
    if (!activeThread?.id || !identity?.privateKeyJwk) return undefined;

    const intervalId = window.setInterval(() => {
      loadHistory({
        threadId: activeThread.id,
        identityValue: identity,
        silent: true,
      });
    }, 12000);

    return () => window.clearInterval(intervalId);
  }, [activeThread, identity]);

  useEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [timeline, activeThread?.id]);

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
      });

      await loadHistory({
        threadId: activeThread.id,
        identityValue: identity,
        silent: true,
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
    setSendingMessage(true);
    const sent = await sendEncryptedPayload({
      messageType: "text",
      plaintext: JSON.stringify({ kind: "text", text }),
    });
    setSendingMessage(false);
    if (sent) setChatInput("");
  }

  async function handleSendRequest(event) {
    event.preventDefault();
    const amount = Number(requestAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTimelineError("Request amount must be a positive number.");
      return;
    }
    setSendingRequest(true);
    const sent = await sendEncryptedPayload({
      messageType: "request",
      plaintext: JSON.stringify({
        kind: "request",
        amountEth: String(amount),
        note: requestNote.trim(),
      }),
      requestAmountValue: amount,
      requestNoteValue: requestNote.trim(),
    });
    setSendingRequest(false);
    if (sent) {
      setRequestAmount("");
      setRequestNote("");
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
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

      <section className="rounded-[2rem] border border-gray-200 bg-white p-3 shadow-sm sm:p-4 lg:h-[calc(100vh-11rem)]">
        <div className="grid gap-3 lg:h-full lg:grid-cols-2">
          <aside className="flex min-h-[34rem] flex-col rounded-3xl border border-gray-200 bg-gray-50 p-4 lg:h-full lg:min-h-0">
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
              <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
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
                          }`}
                        >
                          {getInitials(displayName)}
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
                              <p className="shrink-0 text-[11px] text-gray-500">
                                {formatListDay(friend.createdAt)}
                              </p>
                            </div>
                            <p className="truncate text-xs text-gray-500">@{username}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          <section className="flex min-h-[34rem] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white lg:h-full lg:min-h-0">
            {!activeFriend ? (
              <div className="h-full min-h-[34rem] bg-white lg:min-h-0" />
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
                  {threadLoading || timelineLoading ? (
                    <p className="text-sm text-gray-500">Loading timeline...</p>
                  ) : timeline.length === 0 ? (
                    <p className="text-sm text-gray-500">No messages yet in this conversation.</p>
                  ) : (
                    timeline.map((entry, index) => {
                      const previous = timeline[index - 1];
                      const showDate =
                        !previous ||
                        formatDay(previous.createdAt) !== formatDay(entry.createdAt);

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
                                  {formatAmount(payment.amount)} ETH
                                </p>
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
                                {formatClock(message.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-gray-200 bg-gray-50 px-3 py-3 sm:px-4">
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setComposerMode("request")}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        composerMode === "request"
                          ? "bg-purple-600 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      Request
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerMode("message")}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        composerMode === "message"
                          ? "bg-purple-600 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      Send
                    </button>
                  </div>

                  {composerMode === "message" ? (
                    <form onSubmit={handleSendText} className="flex gap-2">
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
                  ) : (
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
                        disabled={sendingRequest || !activeThread?.id || !identity?.publicKeyJwk}
                        className="rounded-full bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                      >
                        {sendingRequest ? "Requesting..." : "Request"}
                      </button>
                    </form>
                  )}
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
