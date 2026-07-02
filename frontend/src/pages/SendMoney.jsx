import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FieldError,
  PageContainer,
  PageError,
  PageHeader,
  PageNotice,
} from "../components/PageLayout.jsx";
import SuccessTransition from "../components/SuccessTransition.jsx";
import { apiRequest } from "../services/api.js";
import { getCurrentUser } from "../services/authApi.js";
import { createFriend, listFriends } from "../services/friendApi.js";
import {
  createTransferLink,
  sendPaymentVerificationCode,
  sendTransaction,
} from "../services/transactionApi.js";
import { readWalletState, requireAuthToken, writeWalletState } from "../services/session.js";
import { searchUsers } from "../services/userApi.js";
import {
  FORM_CODE_INPUT_CLASS,
  FORM_DANGER_MUTED_BUTTON_CLASS,
  FORM_FIELD_LABEL_CLASS,
  FORM_HELP_TEXT_CLASS,
  FORM_INLINE_PRIMARY_BUTTON_CLASS,
  FORM_INLINE_SECONDARY_BUTTON_CLASS,
  FORM_INPUT_BASE_CLASS,
  FORM_READONLY_INPUT_CLASS,
  FORM_SELECT_BASE_CLASS,
  FORM_SMALL_SECONDARY_BUTTON_CLASS,
} from "../styles/formClasses.js";
import { isValidEvmAddress, normalizeEvmAddress } from "../utils/security.js";
import { copyText, getQrImageUrl, shortWallet } from "../utils/paylink.js";
import { useTransitionNotification } from "../utils/successTransition.js";

import { getUserErrorMessage } from "../utils/userError.js";
const PAYMENT_OPTIONS = [
  { id: "bank", label: "Bank" },
  { id: "card", label: "Card" },
  { id: "address", label: "Address" },
  { id: "link", label: "Link" },
  { id: "qr", label: "QR" },
];

function isComingSoonMethod(method) {
  return method === "bank" || method === "card";
}

function isSuccessfulTransactionStatus(status) {
  return String(status || "").trim().toLowerCase() === "success";
}

function isFailedTransactionStatus(status) {
  return String(status || "").trim().toLowerCase() === "failed";
}

function methodGlyph(id) {
  if (id === "bank") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 10h16" />
        <path d="M4 10 12 5l8 5" />
        <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
        <path d="M4 17h16M3 20h18" />
      </svg>
    );
  }

  if (id === "card") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="6" width="18" height="12" rx="2.5" />
        <path d="M3 10h18" />
        <path d="M7 14h4M13 14h4" />
      </svg>
    );
  }

  if (id === "link") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 14 8.6 15.4a3 3 0 0 1-4.2-4.2L6 9.8" />
        <path d="M14 10 15.4 8.6a3 3 0 1 1 4.2 4.2L18 14.2" />
        <path d="M8.5 12h7" />
      </svg>
    );
  }

  if (id === "address") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h11A2.5 2.5 0 0 1 19 8.5V10h1.5A1.5 1.5 0 0 1 22 11.5v3a1.5 1.5 0 0 1-1.5 1.5H19v1.5A2.5 2.5 0 0 1 16.5 20h-11A2.5 2.5 0 0 1 3 17.5v-9Z" />
        <circle cx="19.5" cy="13" r="0.8" />
        <path d="M7 13h5M7 16h3" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="14.5" y="14.5" width="1.8" height="1.8" rx="0.3" fill="currentColor" stroke="none" />
      <rect x="17.7" y="14.5" width="1.8" height="1.8" rx="0.3" fill="currentColor" stroke="none" />
      <rect x="14.5" y="17.7" width="1.8" height="1.8" rx="0.3" fill="currentColor" stroke="none" />
      <rect x="17.7" y="17.7" width="1.8" height="1.8" rx="0.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function methodIconClasses(id, active) {
  if (active) {
    if (id === "bank") return "border-emerald-300 bg-emerald-100 text-emerald-800 ring-2 ring-emerald-200";
    if (id === "card") return "border-sky-300 bg-sky-100 text-sky-800 ring-2 ring-sky-200";
    if (id === "address") return "border-indigo-300 bg-indigo-100 text-indigo-800 ring-2 ring-indigo-200";
    if (id === "link") return "border-amber-300 bg-amber-100 text-amber-800 ring-2 ring-amber-200";
    return "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-800 ring-2 ring-fuchsia-200";
  }

  if (id === "bank") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (id === "card") return "border-sky-200 bg-sky-50 text-sky-700";
  if (id === "address") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (id === "link") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
}

function friendSearchSource(friend) {
  return [friend.label, friend.username, friend.walletAddress, friend.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function friendRecipient(friend) {
  return {
    key: `friend-${friend.id}`,
    source: "friend",
    id: String(friend.id),
    label: friend.label,
    username: friend.username || "",
    walletAddress: friend.walletAddress || "",
  };
}

function accountRecipient(account) {
  return {
    key: `account-${account.id}`,
    source: "account",
    id: String(account.id),
    label: account.displayName || account.username || "User",
    username: account.username || "",
    walletAddress: account.walletAddress || "",
  };
}

function displayRecipient(recipient) {
  if (!recipient) return "None selected";
  if (recipient.username) return `${recipient.label} (@${recipient.username})`;
  return recipient.label;
}

function methodTitle(method) {
  if (method === "bank") return "Bank transfer";
  if (method === "card") return "Card transfer";
  if (method === "address") return "Transfer to wallet address";
  if (method === "link") return "Create payment link";
  return "Create payment QR";
}

function buildChatSendLink(friend) {
  const params = new URLSearchParams();
  params.set("compose", "send");

  const friendId = String(friend?.id || "").trim();
  const username = String(friend?.username || "").trim();
  const walletAddress = String(friend?.walletAddress || "").trim();

  if (friendId) {
    params.set("friendId", friendId);
  }
  if (username) {
    params.set("friendUsername", username);
  }
  if (walletAddress) {
    params.set("friendWallet", walletAddress);
  }

  return `/chat?${params.toString()}`;
}

function avatarSeed(seed) {
  const text = String(seed || "u");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

function initialsFromLabel(label) {
  const words = String(label || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!words.length) return "?";
  return words.map((word) => word[0]).join("").toUpperCase();
}

export default function SendMoney() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [me, setMe] = useState(null);

  const [friends, setFriends] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const [search, setSearch] = useState("");
  const [pageError, setPageError] = useState("");
  const [accountError, setAccountError] = useState("");

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);

  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [addingFriendId, setAddingFriendId] = useState("");

  const [activeMethod, setActiveMethod] = useState("");
  const [transferStep, setTransferStep] = useState("details");

  const [manualAddress, setManualAddress] = useState("");
  const [amountEth, setAmountEth] = useState("");
  const [sending, setSending] = useState(false);
  const [methodError, setMethodError] = useState("");
  const [methodSuccess, setMethodSuccess] = useState("");
  const [transactionNotification, showTransactionNotification] =
    useTransitionNotification();
  const [availableBalance, setAvailableBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  const [linkNote, setLinkNote] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [requestPrefillDone, setRequestPrefillDone] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationChannel, setVerificationChannel] = useState("email");
  const [verificationDestination, setVerificationDestination] = useState("");
  const [codeSending, setCodeSending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    destination: "",
    amount: "",
    code: "",
  });
  const transferSubmittingRef = useRef(false);

  const friendParam = searchParams.get("friend");
  const requestToParam = String(searchParams.get("to") || "").trim();
  const requestAmountParam = String(searchParams.get("amount") || "").trim();
  const requestFromParam = String(searchParams.get("from") || "").trim();

  useEffect(() => {
    let isCancelled = false;

    async function loadFriends() {
      const token = requireAuthToken();
      if (!token) {
        if (!isCancelled) {
          setPageError("You must be logged in.");
          setLoadingFriends(false);
        }
        return;
      }

      try {
        setPageError("");
        setLoadingFriends(true);

        const response = await listFriends({ token });
        if (isCancelled) return;
        setFriends(response.friends || []);
      } catch (err) {
        if (isCancelled) return;
        setPageError(getUserErrorMessage(err, "Failed to load friends."));
      } finally {
        if (!isCancelled) {
          setLoadingFriends(false);
        }
      }
    }

    loadFriends();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadMyBalance() {
      const token = requireAuthToken();
      if (!token) return;

      try {
        setBalanceLoading(true);
        setBalanceError("");

        const me = await getCurrentUser({ token });
        if (isCancelled) return;
        setMe(me || null);

        const walletState =
          me?.wallet?.linked && me?.wallet?.address
            ? { linked: true, address: me.wallet.address }
            : readWalletState(me?.id);
        const walletAddress = String(walletState?.address || "").trim();

        if (me?.id && walletState?.linked && walletAddress) {
          writeWalletState(me.id, walletAddress);
        }

        if (!walletState?.linked || !walletAddress) {
          setAvailableBalance(null);
          setBalanceError(
            "Link and verify your wallet to generate payment links or QR transfers."
          );
          return;
        }

        const params = new URLSearchParams({ wallet: walletAddress });
        const result = await apiRequest(
          `/api/transactions/balance?${params.toString()}`,
          { token }
        );

        if (isCancelled) return;

        const balance =
          typeof result?.balance === "number" ? result.balance : null;
        setAvailableBalance(balance);
      } catch (err) {
        if (isCancelled) return;
        setAvailableBalance(null);
        setBalanceError(getUserErrorMessage(err, "Failed to load wallet balance."));
      } finally {
        if (!isCancelled) {
          setBalanceLoading(false);
        }
      }
    }

    loadMyBalance();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!friendParam || !friends.length || selectedRecipient) return;
    const matched = friends.find((friend) => String(friend.id) === String(friendParam));
    if (matched) {
      const recipient = friendRecipient(matched);
      setSelectedRecipient(recipient);
      setSearch(recipient.label);
    }
  }, [friendParam, friends, selectedRecipient]);

  useEffect(() => {
    if (requestPrefillDone) return;
    if (!requestToParam || !isValidEvmAddress(requestToParam)) return;

    setRequestPrefillDone(true);
    setActiveMethod("address");
    setManualAddress(requestToParam);

    const parsedRequestedAmount = Number(requestAmountParam);
    if (Number.isFinite(parsedRequestedAmount) && parsedRequestedAmount > 0) {
      setAmountEth(String(parsedRequestedAmount));
    }

    const requestedBy = requestFromParam ? ` from @${requestFromParam}` : "";
    setMethodSuccess(
      `Request link loaded${requestedBy}. Confirm method details and send when ready.`
    );
    setMethodError("");
  }, [requestPrefillDone, requestToParam, requestAmountParam, requestFromParam]);

  useEffect(() => {
    let isCancelled = false;

    const token = requireAuthToken();
    if (!token) {
      setAccounts([]);
      setAccountError("You must be logged in.");
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setLoadingAccounts(true);
        setAccountError("");

        const response = await searchUsers({ token, query: search, limit: 10 });
        if (isCancelled) return;
        setAccounts(response.users || []);
      } catch (err) {
        if (isCancelled) return;
        setAccounts([]);
        setAccountError(getUserErrorMessage(err, "Failed to load search results."));
      } finally {
        if (!isCancelled) {
          setLoadingAccounts(false);
        }
      }
    }, 220);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [search]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!searchContainerRef.current) return;
      if (!searchContainerRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function existingFriendForAccount(account) {
    const username = String(account.username || "").trim().toLowerCase();
    const wallet = String(account.walletAddress || "").trim().toLowerCase();

    return (
      friends.find((friend) => {
        const friendUsername = String(friend.username || "").trim().toLowerCase();
        const friendWallet = String(friend.walletAddress || "").trim().toLowerCase();

        if (username && friendUsername === username) return true;
        if (wallet && friendWallet === wallet) return true;
        return false;
      }) || null
    );
  }

  async function handleAddFriendFromAccount(account) {
    const token = requireAuthToken();
    if (!token) {
      setPageError("You must be logged in.");
      return;
    }

    const existing = existingFriendForAccount(account);
    if (existing) {
      const recipient = friendRecipient(existing);
      setSelectedRecipient(recipient);
      setSearch(recipient.label);
      setMethodSuccess(`${existing.label} is already in your friends list.`);
      setIsSearchOpen(false);
      return;
    }

    try {
      setAddingFriendId(String(account.id));
      setPageError("");
      setMethodError("");

      const username = String(account.username || "").trim();
      const walletAddress = String(account.walletAddress || "").trim();
      const label = String(account.displayName || "").trim() || username || "Friend";

      const response = await createFriend({
        token,
        label,
        username: username || undefined,
        walletAddress: walletAddress || undefined,
      });

      if (!response.friend) {
        throw new Error("Failed to add friend.");
      }

      const recipient = friendRecipient(response.friend);
      setFriends((prev) => [response.friend, ...prev]);
      setSelectedRecipient(recipient);
      setSearch(recipient.label);
      setMethodSuccess(`${response.friend.label} added to friends.`);
      setIsSearchOpen(false);
    } catch (err) {
      setMethodError(getUserErrorMessage(err, "Failed to add friend."));
    } finally {
      setAddingFriendId("");
    }
  }

  function selectSearchResult(result) {
    if (result.kind === "friend") {
      const recipient = friendRecipient(result.friend);
      setSelectedRecipient(recipient);
      setSearch(recipient.label);
    } else {
      const recipient = accountRecipient(result.account);
      setSelectedRecipient(recipient);
      setSearch(recipient.label);
    }

    setMethodError("");
    setMethodSuccess("");
    setVerificationCode("");
    setVerificationDestination("");
    setFieldErrors({ destination: "", amount: "", code: "" });
    setIsSearchOpen(false);
  }

  function clearSelectedRecipientForManualAddress() {
    setSelectedRecipient(null);
    setSearch("");
    setVerificationCode("");
    setVerificationDestination("");
    setMethodError("");
    setMethodSuccess("");
    setFieldErrors({ destination: "", amount: "", code: "" });
  }

  function resetMethodState() {
    setTransferStep("details");
    setManualAddress("");
    setAmountEth("");
    setLinkNote("");
    setGeneratedLink("");
    setLinkCopied(false);
    setVerificationCode("");
    setVerificationDestination("");
    setVerificationChannel("email");
    setMethodError("");
    setMethodSuccess("");
    setFieldErrors({ destination: "", amount: "", code: "" });
  }

  function openMethod(method) {
    if (isComingSoonMethod(method)) {
      setActiveMethod("");
      resetMethodState();
      setMethodSuccess(`${methodTitle(method)} is coming soon.`);
      return;
    }
    setActiveMethod(method);
    resetMethodState();
  }

  function closeMethod() {
    setActiveMethod("");
    resetMethodState();
  }

  function cancelTransferSummary() {
    closeMethod();
  }

  function selectedRecipientWallet() {
    const wallet = String(selectedRecipient?.walletAddress || "").trim();
    return isValidEvmAddress(wallet) ? normalizeEvmAddress(wallet) : "";
  }

  function addressTransferDestination() {
    const selectedWalletForTransfer = selectedRecipientWallet();
    if (selectedWalletForTransfer) {
      return {
        destination: selectedWalletForTransfer,
        receiver: displayRecipient(selectedRecipient),
        source: "recipient",
      };
    }

    return {
      destination: String(manualAddress || "").trim(),
      receiver: "Manual wallet address",
      source: "manual",
    };
  }

  function validateAddressTransferDetails() {
    const nextFieldErrors = { destination: "", amount: "", code: "" };
    const { destination, receiver, source } = addressTransferDestination();
    if (!isValidEvmAddress(destination)) {
      nextFieldErrors.destination =
        source === "recipient"
          ? "Selected recipient has an invalid wallet address."
          : "Enter a valid destination wallet address.";
      setFieldErrors(nextFieldErrors);
      return null;
    }

    const normalizedDestination = normalizeEvmAddress(destination);
    const myWallet = normalizeEvmAddress(me?.wallet?.address);
    if (myWallet && normalizedDestination === myWallet) {
      nextFieldErrors.destination =
        "You cannot transfer funds to your own wallet address.";
      setFieldErrors(nextFieldErrors);
      return null;
    }

    const amount = Number(String(amountEth).trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      nextFieldErrors.amount = "Amount must be a positive number.";
      setFieldErrors(nextFieldErrors);
      return null;
    }

    if (balanceLoading) {
      setMethodError("Checking your balance. Please wait and try again.");
      return null;
    }

    if (!Number.isFinite(availableBalance)) {
      setMethodError("Unable to verify your balance right now.");
      return null;
    }

    if (amount > availableBalance) {
      nextFieldErrors.amount = `Insufficient balance. Available: ${availableBalance.toFixed(4)} ETH.`;
      setFieldErrors(nextFieldErrors);
      return null;
    }

    setFieldErrors(nextFieldErrors);
    return { destination: normalizedDestination, amount, receiver, source };
  }

  function validateDirectTransferDetails() {
    const nextFieldErrors = { destination: "", amount: "", code: "" };

    if (!selectedRecipient) {
      nextFieldErrors.destination = "Select a recipient first.";
      setFieldErrors(nextFieldErrors);
      return null;
    }

    const wallet = String(selectedRecipient.walletAddress || "").trim();
    if (!wallet) {
      nextFieldErrors.destination =
        "Selected recipient does not have a linked wallet.";
      setFieldErrors(nextFieldErrors);
      return null;
    }

    if (!isValidEvmAddress(wallet)) {
      nextFieldErrors.destination =
        "Selected recipient has an invalid wallet address.";
      setFieldErrors(nextFieldErrors);
      return null;
    }

    const normalizedWallet = normalizeEvmAddress(wallet);
    const myWallet = normalizeEvmAddress(me?.wallet?.address);
    if (myWallet && normalizedWallet === myWallet) {
      nextFieldErrors.destination =
        "You cannot transfer funds to your own wallet address.";
      setFieldErrors(nextFieldErrors);
      return null;
    }

    const amount = Number(String(amountEth).trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      nextFieldErrors.amount = "Amount must be a positive number.";
      setFieldErrors(nextFieldErrors);
      return null;
    }

    if (balanceLoading) {
      setMethodError("Checking your balance. Please wait and try again.");
      setFieldErrors(nextFieldErrors);
      return null;
    }

    if (!Number.isFinite(availableBalance)) {
      setMethodError("Unable to verify your balance right now.");
      setFieldErrors(nextFieldErrors);
      return null;
    }

    if (amount > availableBalance) {
      nextFieldErrors.amount = `Insufficient balance. Available: ${availableBalance.toFixed(4)} ETH.`;
      setFieldErrors(nextFieldErrors);
      return null;
    }

    setFieldErrors(nextFieldErrors);
    return { wallet: normalizedWallet, amount };
  }

  function goToAddressVerification() {
    setMethodError("");
    setMethodSuccess("");

    if (!validateAddressTransferDetails()) return;

    setTransferStep("verification");
    setVerificationCode("");
    setVerificationDestination("");
  }

  async function handleSendDirect(event) {
    event.preventDefault();
    if (transferSubmittingRef.current) return;
    setMethodError("");
    setMethodSuccess("");

    const details = validateDirectTransferDetails();
    if (!details) return;

    const normalizedCode = String(verificationCode || "").trim();
    if (normalizedCode.length < 6) {
      setFieldErrors((current) => ({
        ...current,
        code: "Enter the 6-digit verification code before sending.",
      }));
      return;
    }

    const token = requireAuthToken();
    if (!token) {
      setMethodError("You must be logged in.");
      return;
    }

    try {
      transferSubmittingRef.current = true;
      setSending(true);
      const result = await sendTransaction({
        token,
        receiverWallet: details.wallet,
        amountEth: details.amount,
        verificationCode: normalizedCode,
      });

      const status = result?.transaction?.status || "pending";
      setMethodSuccess(`Transfer created with status "${status}".`);
      if (isSuccessfulTransactionStatus(status)) {
        showTransactionNotification("Transaction successful", { variant: "success" });
      } else if (isFailedTransactionStatus(status)) {
        const message = result?.transaction?.failureReason || "Transaction failed.";
        setMethodError(message);
        showTransactionNotification(message, { variant: "error" });
      }
      setVerificationCode("");
      setVerificationDestination("");
    } catch (err) {
      const message = getUserErrorMessage(err, "Failed to send transaction.");
      setMethodError(message);
      showTransactionNotification(message, { variant: "error" });
    } finally {
      transferSubmittingRef.current = false;
      setSending(false);
    }
  }

  async function handleSendByAddress(event) {
    event.preventDefault();
    if (transferSubmittingRef.current) return;
    setMethodError("");
    setMethodSuccess("");

    const details = validateAddressTransferDetails();
    if (!details) return;

    if (!verificationDestination) {
      setMethodError(
        "Send and verify the code after entering destination address and amount."
      );
      return;
    }

    const normalizedCode = String(verificationCode || "").trim();
    if (normalizedCode.length < 6) {
      setFieldErrors((current) => ({
        ...current,
        code: "Enter the 6-digit verification code to verify and send.",
      }));
      return;
    }

    const token = requireAuthToken();
    if (!token) {
      setMethodError("You must be logged in.");
      return;
    }

    try {
      transferSubmittingRef.current = true;
      setSending(true);
      const result = await sendTransaction({
        token,
        receiverWallet: details.destination,
        amountEth: details.amount,
        verificationCode: normalizedCode,
      });

      const status = result?.transaction?.status || "pending";
      setMethodSuccess(`Transfer created with status "${status}".`);
      if (isSuccessfulTransactionStatus(status)) {
        showTransactionNotification("Transaction successful", { variant: "success" });
      } else if (isFailedTransactionStatus(status)) {
        const message = result?.transaction?.failureReason || "Transaction failed.";
        setMethodError(message);
        showTransactionNotification(message, { variant: "error" });
      }
      setVerificationCode("");
      setVerificationDestination("");
    } catch (err) {
      const message = getUserErrorMessage(err, "Failed to send transaction.");
      setMethodError(message);
      showTransactionNotification(message, { variant: "error" });
    } finally {
      transferSubmittingRef.current = false;
      setSending(false);
    }
  }

  async function handleGenerateClaimLink(event) {
    event.preventDefault();
    setMethodError("");
    setMethodSuccess("");
    setGeneratedLink("");
    setLinkCopied(false);

    if (!isValidEvmAddress(String(me?.wallet?.address || "").trim())) {
      setMethodError("Link and verify your wallet before generating a transfer link.");
      return;
    }

    const amount = Number(String(amountEth).trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setFieldErrors((current) => ({
        ...current,
        amount: "Amount must be a positive number.",
      }));
      return;
    }

    if (balanceLoading) {
      setMethodError("Checking your balance. Please wait and try again.");
      return;
    }

    if (!Number.isFinite(availableBalance)) {
      setMethodError("Unable to verify your balance right now.");
      return;
    }

    if (amount > availableBalance) {
      setFieldErrors((current) => ({
        ...current,
        amount: `Insufficient balance. Available: ${availableBalance.toFixed(4)} ETH.`,
      }));
      return;
    }

    const token = requireAuthToken();
    if (!token) {
      setMethodError("You must be logged in.");
      return;
    }

    try {
      setLinkLoading(true);
      const response = await createTransferLink({
        token,
        amountEth: amount,
        note: String(linkNote || "").trim() || undefined,
      });

      const claimToken = String(response.linkToken || "").trim();
      if (!claimToken) {
        throw new Error("Could not create transfer link.");
      }

      const origin =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "";
      const url = `${origin}/claim-transfer?token=${encodeURIComponent(claimToken)}`;
      setGeneratedLink(url);
      setMethodSuccess("Link created. Share it with the receiver to claim funds.");
      showTransactionNotification("Link created", { variant: "success" });
    } catch (err) {
      const message = getUserErrorMessage(err, "Failed to generate link.");
      setMethodError(message);
      showTransactionNotification(message, { variant: "error" });
    } finally {
      setLinkLoading(false);
    }
  }

  async function handleCopyLink() {
    if (!generatedLink) return;

    const didCopy = await copyText(generatedLink);
    if (didCopy) {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1400);
      return;
    }

    window.prompt("Copy this link:", generatedLink);
  }

  async function handleShareLink() {
    if (!generatedLink) return;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Claim transfer",
          text: "Open this link to claim your transfer.",
          url: generatedLink,
        });
        return;
      } catch {
        // fallback to copy
      }
    }

    await handleCopyLink();
  }

  async function handleSendCode() {
    const token = requireAuthToken();
    if (!token) {
      setMethodError("You must be logged in.");
      return;
    }

    if (activeMethod === "address") {
      if (!validateAddressTransferDetails()) return;
    } else if (!validateDirectTransferDetails()) {
      return;
    }

    try {
      setCodeSending(true);
      setMethodError("");
      const response = await sendPaymentVerificationCode({
        token,
        verificationChannel,
      });
      setVerificationDestination(String(response?.destination || "").trim());
      if (activeMethod === "address") {
        setMethodSuccess("");
      } else {
        setMethodSuccess(
          `Verification code sent via ${response?.verificationChannel || verificationChannel}.`
        );
      }
    } catch (err) {
      setMethodError(getUserErrorMessage(err, "Failed to send verification code."));
    } finally {
      setCodeSending(false);
    }
  }

  const filteredFriends = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return friends.slice(0, 6);
    return friends.filter((friend) => friendSearchSource(friend).includes(query)).slice(0, 8);
  }, [friends, search]);

  const quickFriends = useMemo(() => friends.slice(0, 12), [friends]);

  const searchResults = useMemo(() => {
    const friendItems = filteredFriends.map((friend) => ({
      kind: "friend",
      key: `friend-${friend.id}`,
      friend,
    }));

    const accountItems = accounts.map((account) => ({
      kind: "account",
      key: `account-${account.id}`,
      account,
    }));

    return [...friendItems, ...accountItems].slice(0, 12);
  }, [filteredFriends, accounts]);

  const selectedWallet = String(selectedRecipient?.walletAddress || "").trim();
  const linkedWallet = String(me?.wallet?.address || "").trim();
  const parsedAmount = Number(String(amountEth).trim());
  const hasPositiveAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const hasValidLinkedWallet = isValidEvmAddress(linkedWallet);
  const addressDestination = addressTransferDestination();
  const hasSelectedAddressDestination = addressDestination.source === "recipient";
  const addressDestinationWallet = addressDestination.destination;
  const hasValidAddressDestination = isValidEvmAddress(addressDestinationWallet);
  const hasLoadedBalance = !balanceLoading && Number.isFinite(availableBalance);
  const exceedsBalance =
    hasPositiveAmount &&
    Number.isFinite(availableBalance) &&
    parsedAmount > availableBalance;
  const amountWithinBalance = hasPositiveAmount && hasLoadedBalance && !exceedsBalance;
  const addressFieldsReady = hasValidAddressDestination && hasPositiveAmount;
  const canCreateClaimTransfer = hasValidLinkedWallet && amountWithinBalance;
  const canUsePhoneVerification = Boolean(String(me?.phoneNumber || "").trim());
  const isAddressVerificationStep =
    activeMethod === "address" && transferStep === "verification";

  return (
    <>
      <SuccessTransition
        message={transactionNotification.message}
        variant={transactionNotification.variant}
      />

      <PageContainer stack>
      <PageHeader
        title="New payment"
        description="Select a recipient and method to send funds securely."
      />

      <section className="rounded-[2.2rem] border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
        <div ref={searchContainerRef}>
          <label htmlFor="send-recipient-search" className={FORM_FIELD_LABEL_CLASS}>
            Recipient
          </label>
          <p className={`${FORM_HELP_TEXT_CLASS} mb-2`}>
            Search by name, username, or linked wallet.
          </p>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 focus-within:border-purple-300 focus-within:ring-2 focus-within:ring-purple-200">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-purple-500"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="11" cy="11" r="6.8" strokeWidth="1.8" />
              <path d="m16 16 4 4" strokeWidth="1.8" />
            </svg>
            <input
              id="send-recipient-search"
              ref={searchInputRef}
              type="text"
              value={search}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(event) => {
                setSearch(event.target.value);
                setIsSearchOpen(true);
              }}
              placeholder="Search recipient"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none"
            />
          </div>

          {isSearchOpen && (
            <div className="relative z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
              {(loadingFriends || loadingAccounts) && (
                <div className="rounded-xl px-3 py-2 text-xs text-gray-500">Searching...</div>
              )}

              {!(loadingFriends || loadingAccounts) && searchResults.length === 0 && (
                <div className="rounded-xl px-3 py-2 text-xs text-gray-500">No results found.</div>
              )}

              {searchResults.map((result) => {
                const isFriend = result.kind === "friend";
                const data = isFriend ? result.friend : result.account;
                const recipient = isFriend ? friendRecipient(data) : accountRecipient(data);
                const isSelected = selectedRecipient?.key === recipient.key;
                const existing = isFriend ? null : existingFriendForAccount(data);
                const isAdding = addingFriendId === String(data.id);

                return (
                  <button
                    key={result.key}
                    type="button"
                    onClick={() => selectSearchResult(result)}
                    className={`mb-1 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition last:mb-0 ${
                      isSelected
                        ? "border-purple-300 bg-purple-50"
                        : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: `hsl(${avatarSeed(recipient.key)} 72% 44%)` }}
                      >
                        {initialsFromLabel(recipient.label)}
                      </span>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {isFriend ? data.label : data.displayName || data.username || "User"}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {data.username ? `@${data.username}` : shortWallet(data.walletAddress)}
                        </p>
                      </div>
                    </div>

                    <div className="ml-2 shrink-0 text-right">
                      {isFriend ? (
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                            data.walletAddress
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {data.walletAddress ? "Friend" : "No wallet"}
                        </span>
                      ) : existing ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                          In friends
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleAddFriendFromAccount(data);
                          }}
                          disabled={isAdding}
                          className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                        >
                          {isAdding ? "Adding..." : "Add"}
                        </button>
                      )}
                    </div>
                  </button>
                );
              })}

              {accountError && (
                <p className="px-2 pt-1 text-xs text-red-600">{accountError}</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {PAYMENT_OPTIONS.map((option) => {
            const comingSoon = isComingSoonMethod(option.id);
            const active = !comingSoon && activeMethod === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => openMethod(option.id)}
                className={`text-center ${comingSoon ? "opacity-80" : ""}`}
              >
                <div
                  className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl border transition ${methodIconClasses(
                    option.id,
                    active
                  )}`}
                >
                  {methodGlyph(option.id)}
                </div>
                <div className="mt-2 text-base font-medium text-gray-800">{option.label}</div>
                {comingSoon ? (
                  <div className="mt-0.5 text-[11px] font-semibold text-amber-700">
                    Coming soon
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>

        {(pageError || (!activeMethod && (methodError || methodSuccess))) && (
          <div className="mt-6 space-y-2">
            <PageError>{pageError}</PageError>

            <PageError>{methodError}</PageError>

            <PageNotice variant="success">{methodSuccess}</PageNotice>
          </div>
        )}

        <section className="mt-5 rounded-2xl border border-gray-200 bg-white/85 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              Saved friends ({friends.length})
            </h2>
            <button
              type="button"
              onClick={() => navigate("/friends")}
              className="text-xs font-medium text-purple-700 hover:underline"
            >
              Manage
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {loadingFriends && (
              <div className="rounded-xl bg-white px-3 py-2 text-xs text-gray-500">
                Loading friends...
              </div>
            )}

            {!loadingFriends && quickFriends.length === 0 && (
              <div className="rounded-xl bg-white px-3 py-2 text-xs text-gray-500">
                No saved friends yet.
              </div>
            )}

            {!loadingFriends &&
              quickFriends.map((friend) => {
                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => navigate(buildChatSendLink(friend))}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition hover:border-purple-300 hover:bg-purple-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {friend.label}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {friend.username
                          ? `@${friend.username}`
                          : shortWallet(friend.walletAddress) || "No username"}
                      </p>
                    </div>

                    <span className="ml-2 rounded-full bg-purple-100 px-2 py-1 text-[11px] font-semibold text-purple-700">
                      Open chat
                    </span>
                  </button>
                );
              })}
          </div>
        </section>
      </section>

      {activeMethod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-purple-100 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{methodTitle(activeMethod)}</h2>
              <button
                type="button"
                onClick={closeMethod}
                className={FORM_SMALL_SECONDARY_BUTTON_CLASS}
                aria-label="Close payment method page"
              >
                Close
              </button>
            </div>

            <PageError className="mt-3">{methodError}</PageError>

            <PageNotice className="mt-3" variant="success">
              {methodSuccess}
            </PageNotice>

            {!isAddressVerificationStep ? (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                {activeMethod === "address" ? (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Receiver
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {hasSelectedAddressDestination
                        ? displayRecipient(selectedRecipient)
                        : "Manual wallet address"}
                    </p>
                    <p className="text-xs text-gray-600">
                      {hasSelectedAddressDestination
                        ? shortWallet(addressDestinationWallet)
                        : "Enter a destination address below."}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Recipient
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {displayRecipient(selectedRecipient)}
                    </p>
                    <p className="text-xs text-gray-600">
                      {selectedRecipient
                        ? shortWallet(selectedWallet) || "No linked wallet"
                        : "No recipient selected"}
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {!isAddressVerificationStep ? (
              <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                {balanceLoading ? (
                  <p className="text-xs text-gray-500">Checking balance...</p>
                ) : Number.isFinite(availableBalance) ? (
                  <p className="text-xs text-gray-600">
                    Available balance:{" "}
                    <span className="font-mono font-semibold text-gray-900">
                      {availableBalance.toFixed(4)} ETH
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-red-600">
                    {balanceError || "Balance unavailable."}
                  </p>
                )}
              </div>
            ) : null}

            {!isAddressVerificationStep && exceedsBalance ? (
              <p className="mt-2 text-xs font-medium text-red-600">
                Amount exceeds your available balance.
              </p>
            ) : null}

            {activeMethod === "address" && (
              <>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  {transferStep === "details"
                    ? "Step 1 of 2: Details"
                    : "Step 2 of 2: Summary and verification"}
                </p>

                {transferStep === "details" ? (
                  <div className="mt-3 space-y-3">
                    {hasSelectedAddressDestination ? (
                      <div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                Receiver
                              </p>
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {displayRecipient(selectedRecipient)}
                              </p>
                              <p className="break-all font-mono text-xs text-gray-600">
                                {addressDestinationWallet}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={clearSelectedRecipientForManualAddress}
                              className={`shrink-0 ${FORM_SMALL_SECONDARY_BUTTON_CLASS}`}
                            >
                              Manual
                            </button>
                          </div>
                        </div>
                        <FieldError>{fieldErrors.destination}</FieldError>
                      </div>
                    ) : (
                      <div>
                        <label className={FORM_FIELD_LABEL_CLASS}>
                          Destination wallet
                        </label>
                        <input
                          type="text"
                          value={manualAddress}
                          onChange={(event) => {
                            setManualAddress(event.target.value);
                            setVerificationCode("");
                            setVerificationDestination("");
                            setFieldErrors((current) => ({
                              ...current,
                              destination: "",
                              code: "",
                            }));
                          }}
                          placeholder="0x..."
                          className={`${FORM_INPUT_BASE_CLASS} font-mono`}
                        />
                        <FieldError>{fieldErrors.destination}</FieldError>
                      </div>
                    )}

                    <div>
                      <label className={FORM_FIELD_LABEL_CLASS}>
                        Amount
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={amountEth}
                        onChange={(event) => {
                          setAmountEth(event.target.value);
                          setVerificationCode("");
                          setVerificationDestination("");
                          setFieldErrors((current) => ({
                            ...current,
                            amount: "",
                            code: "",
                          }));
                        }}
                        placeholder="0.00 ETH"
                        className={FORM_INPUT_BASE_CLASS}
                      />
                      <FieldError>{fieldErrors.amount}</FieldError>
                    </div>

                    {!addressFieldsReady ? (
                      <p className={FORM_HELP_TEXT_CLASS}>
                        {hasSelectedAddressDestination
                          ? "Enter an amount to continue to verification."
                          : "Enter destination address and amount to continue to verification."}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={goToAddressVerification}
                      className={`w-full ${FORM_INLINE_PRIMARY_BUTTON_CLASS}`}
                    >
                      Continue to verification
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSendByAddress} className="mt-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                          Transaction summary
                        </p>
                        <div className="mt-2 grid gap-2 text-xs">
                          <div>
                            <p className="text-gray-500">Receiver</p>
                            <p className="font-semibold text-gray-900">
                              {addressDestination.receiver}
                            </p>
                            <p className="break-all font-mono text-[11px] text-gray-600">
                              {addressDestination.destination}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Total amount</p>
                            <p className="font-semibold text-gray-900">{amountEth || "0"} ETH</p>
                          </div>
                        </div>
                        {!balanceLoading && Number.isFinite(availableBalance) ? (
                          <p className="mt-1 text-[11px] text-gray-500">
                            Balance:{" "}
                            <span className="font-mono text-gray-700">
                              {availableBalance.toFixed(4)} ETH
                            </span>
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setTransferStep("details")}
                        className={`shrink-0 ${FORM_SMALL_SECONDARY_BUTTON_CLASS}`}
                      >
                        Edit
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr,auto]">
                      <div>
                        <label className={FORM_FIELD_LABEL_CLASS}>
                          Verification channel
                        </label>
                        <select
                          value={verificationChannel}
                          onChange={(event) => setVerificationChannel(event.target.value)}
                          className={FORM_SELECT_BASE_CLASS}
                        >
                          <option value="email">Email</option>
                          {canUsePhoneVerification ? <option value="phone">Phone</option> : null}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={codeSending}
                        className={FORM_INLINE_SECONDARY_BUTTON_CLASS}
                      >
                        {codeSending ? "Sending code..." : "Send code"}
                      </button>
                    </div>

                    {verificationDestination ? (
                      <p className={FORM_HELP_TEXT_CLASS}>
                        Code sent to <span className="font-semibold">{verificationDestination}</span>
                      </p>
                    ) : (
                      <p className={FORM_HELP_TEXT_CLASS}>Send a verification code to continue.</p>
                    )}

                    {verificationDestination ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr,auto] sm:items-end">
                        <div>
                          <label className={FORM_FIELD_LABEL_CLASS}>
                            Verification code
                          </label>
                          <input
                            type="text"
                            value={verificationCode}
                            onChange={(event) => {
                              setVerificationCode(String(event.target.value || "").replace(/\D/g, ""));
                              setFieldErrors((current) => ({
                                ...current,
                                code: "",
                              }));
                            }}
                            maxLength={6}
                            placeholder="6 digits"
                            className={FORM_CODE_INPUT_CLASS}
                          />
                          <FieldError>{fieldErrors.code}</FieldError>
                        </div>
                        <button
                          type="submit"
                          disabled={sending}
                          className={FORM_INLINE_PRIMARY_BUTTON_CLASS}
                        >
                          {sending ? "Sending..." : "Confirm and send"}
                        </button>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={cancelTransferSummary}
                      disabled={sending}
                      className={FORM_DANGER_MUTED_BUTTON_CLASS}
                    >
                      Cancel transfer
                    </button>
                  </form>
                )}
              </>
            )}

            {(activeMethod === "bank" || activeMethod === "card") && (
              <form onSubmit={handleSendDirect} className="mt-4 space-y-3">
                <div>
                  <label className={FORM_FIELD_LABEL_CLASS}>Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={amountEth}
                    onChange={(event) => {
                      setAmountEth(event.target.value);
                      setFieldErrors((current) => ({
                        ...current,
                        amount: "",
                        code: "",
                      }));
                    }}
                    placeholder="0.00 ETH"
                    className={FORM_INPUT_BASE_CLASS}
                  />
                  <FieldError>{fieldErrors.amount}</FieldError>
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr,auto]">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <label className={FORM_FIELD_LABEL_CLASS}>
                      Verification channel
                    </label>
                    <select
                      value={verificationChannel}
                      onChange={(event) => setVerificationChannel(event.target.value)}
                      className={FORM_SELECT_BASE_CLASS}
                    >
                      <option value="email">Email</option>
                      {canUsePhoneVerification ? <option value="phone">Phone</option> : null}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={codeSending}
                    className={FORM_INLINE_SECONDARY_BUTTON_CLASS}
                  >
                    {codeSending ? "Sending code..." : "Send code"}
                  </button>
                </div>

                {verificationDestination ? (
                  <p className={FORM_HELP_TEXT_CLASS}>
                    Code sent to <span className="font-semibold">{verificationDestination}</span>
                  </p>
                ) : (
                  <p className={FORM_HELP_TEXT_CLASS}>Send a verification code to continue.</p>
                )}

                {verificationDestination ? (
                  <>
                    <div>
                      <label className={FORM_FIELD_LABEL_CLASS}>
                        Verification code
                      </label>
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(event) => {
                          setVerificationCode(String(event.target.value || "").replace(/\D/g, ""));
                          setFieldErrors((current) => ({
                            ...current,
                            code: "",
                          }));
                        }}
                        maxLength={6}
                        placeholder="6 digits"
                        className={FORM_CODE_INPUT_CLASS}
                      />
                      <FieldError>{fieldErrors.code}</FieldError>
                    </div>

                    <button
                      type="submit"
                      disabled={sending}
                      className={`w-full ${FORM_INLINE_PRIMARY_BUTTON_CLASS}`}
                    >
                      {sending ? "Sending..." : "Send now"}
                    </button>
                  </>
                ) : null}
              </form>
            )}

            {(activeMethod === "link" || activeMethod === "qr") && (
              <form onSubmit={handleGenerateClaimLink} className="mt-4 space-y-3">
                <div>
                  <label className={FORM_FIELD_LABEL_CLASS}>Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={amountEth}
                    onChange={(event) => {
                      setAmountEth(event.target.value);
                      setFieldErrors((current) => ({
                        ...current,
                        amount: "",
                      }));
                    }}
                    placeholder="0.00 ETH"
                    className={FORM_INPUT_BASE_CLASS}
                  />
                  <FieldError>{fieldErrors.amount}</FieldError>
                </div>

                <div>
                  <label className={FORM_FIELD_LABEL_CLASS}>Note</label>
                  <input
                    type="text"
                    value={linkNote}
                    onChange={(event) => setLinkNote(event.target.value)}
                    placeholder="Optional"
                    className={FORM_INPUT_BASE_CLASS}
                  />
                </div>

                <button
                  type="submit"
                  disabled={linkLoading || !canCreateClaimTransfer}
                  className={`w-full ${FORM_INLINE_PRIMARY_BUTTON_CLASS}`}
                >
                  {linkLoading ? "Generating..." : "Generate"}
                </button>

                {generatedLink && (
                  <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="min-w-0 flex-1">
                        <label htmlFor="send-generated-link" className={FORM_FIELD_LABEL_CLASS}>
                          Claim link
                        </label>
                        <input
                          id="send-generated-link"
                          type="text"
                          readOnly
                          value={generatedLink}
                          className={`min-w-0 ${FORM_READONLY_INPUT_CLASS} text-xs`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className={FORM_INLINE_SECONDARY_BUTTON_CLASS}
                      >
                        {linkCopied ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={handleShareLink}
                        className={FORM_INLINE_PRIMARY_BUTTON_CLASS}
                      >
                        Share
                      </button>
                    </div>

                    {activeMethod === "qr" && (
                      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <div className="mx-auto w-fit rounded-xl border border-white bg-white p-2 shadow-sm">
                          <img
                            src={getQrImageUrl(generatedLink)}
                            alt="QR code for claim link"
                            className="h-40 w-40"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
      </PageContainer>
    </>
  );
}
