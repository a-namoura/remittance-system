import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageContainer, PageError, PageHeader } from "../components/PageLayout.jsx";
import { getCurrentUser } from "../services/authApi.js";
import { listFriends } from "../services/friendApi.js";
import { getMyTransactions, getWalletBalance } from "../services/transactionApi.js";
import {
  clearSessionStorage,
  requireAuthToken,
  readWalletState,
  writeWalletState,
} from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { openExternalUrl } from "../utils/security.js";

import { getUserErrorMessage } from "../utils/userError.js";
const QUICK_PLUS_ACTIONS = [
  {
    id: "buy",
    label: "Buy",
    description: "Purchase assets directly into your linked account.",
  },
  {
    id: "sell",
    label: "Sell",
    description: "Sell assets and move value back to your account balance.",
  },
  {
    id: "convert",
    label: "Convert",
    description: "Switch between supported assets and currencies.",
  },
  {
    id: "deposit",
    label: "Deposit",
    description: "Top up your account from an external wallet or bank.",
  },
  {
    id: "withdraw",
    label: "Withdraw",
    description: "Move funds out of your account to a destination wallet.",
  },
];

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
}

function directionBadgeClasses(direction) {
  if (direction === "received") return "bg-blue-100 text-blue-700";
  return "bg-purple-100 text-purple-700";
}

function linkedBadgeClass(linked) {
  return linked ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700";
}

function quickActionIconClasses(actionId) {
  if (actionId === "buy") return "bg-emerald-100 text-emerald-700";
  if (actionId === "sell") return "bg-rose-100 text-rose-700";
  if (actionId === "convert") return "bg-violet-100 text-violet-700";
  if (actionId === "deposit") return "bg-sky-100 text-sky-700";
  if (actionId === "withdraw") return "bg-amber-100 text-amber-700";
  return "bg-indigo-100 text-indigo-700";
}

function quickActionIcon(actionId) {
  if (actionId === "buy") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="8" strokeWidth="1.8" />
        <path d="M12 8v8M8 12h8" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (actionId === "sell") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="8" strokeWidth="1.8" />
        <path d="M8 12h8" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (actionId === "convert") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
        <path d="M6 8h10l-2.5-2.5M18 16H8l2.5 2.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (actionId === "deposit") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
        <path d="M12 5v10M8.5 8.5 12 5l3.5 3.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 19h14" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
      <path d="M12 19V9M8.5 15.5 12 19l3.5-3.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5h14" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  const [accountLinked, setAccountLinked] = useState(false);
  const [accountAddress, setAccountAddress] = useState("");
  const [accountBalances, setAccountBalances] = useState({});
  const [availableCurrencies, setAvailableCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  const [friends, setFriends] = useState([]);
  const [friendsError, setFriendsError] = useState("");

  const [transactions, setTransactions] = useState([]);
  const [txError, setTxError] = useState("");

  const [isPlusModalOpen, setIsPlusModalOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadDashboard() {
      const token = requireAuthToken();
      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        setError("");
        const user = await getCurrentUser({ token });
        if (isCancelled) return;

        setMe(user);
        if (!user?.id) {
          setAccountLinked(false);
          setAccountAddress("");
          setAccountBalances({});
          setAvailableCurrencies([]);
          setSelectedCurrency("");
          return;
        }

        const serverWalletAddress = String(user?.wallet?.address || "").trim();
        if (user?.wallet?.linked && serverWalletAddress) {
          setAccountLinked(true);
          setAccountAddress(serverWalletAddress);
          writeWalletState(user.id, serverWalletAddress);
          return;
        }

        const walletState = readWalletState(user.id);
        setAccountLinked(walletState.linked);
        setAccountAddress(walletState.address);
      } catch (err) {
        if (isCancelled) return;
        setError(getUserErrorMessage(err, "Failed to load dashboard."));

        if (err.status === 401 || err.status === 403) {
          clearSessionStorage();
          navigate("/login", { replace: true });
        }
      }
    }

    loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    let isCancelled = false;

    async function loadFriends() {
      const token = requireAuthToken();
      if (!token) return;

      try {
        setFriendsError("");
        const data = await listFriends({ token });
        if (isCancelled) return;
        setFriends(data.friends || []);
      } catch (err) {
        if (isCancelled) return;
        setFriendsError(getUserErrorMessage(err, "Failed to load friends."));
      }
    }

    loadFriends();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadTransactions() {
      const token = requireAuthToken();
      if (!token) return;

      try {
        setTxError("");
        const data = await getMyTransactions({ token, limit: 12 });
        if (isCancelled) return;
        setTransactions(data.transactions || []);
      } catch (err) {
        if (isCancelled) return;
        setTxError(getUserErrorMessage(err, "Failed to load activity."));
      }
    }

    loadTransactions();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function fetchAccountBalance() {
      if (!accountLinked || !accountAddress) {
        if (!isCancelled) {
          setBalanceLoading(false);
          setAccountBalances({});
          setAvailableCurrencies([]);
          setSelectedCurrency("");
          setBalanceError("");
        }
        return;
      }

      try {
        const token = requireAuthToken();
        if (!token) return;

        setBalanceLoading(true);
        setBalanceError("");
        const result = await getWalletBalance({
          token,
          wallet: accountAddress,
        });

        if (isCancelled) return;

        const balances =
          result?.balances && typeof result.balances === "object"
            ? result.balances
            : {};

        const currencies = Array.isArray(result?.availableCurrencies)
          ? result.availableCurrencies
              .map((value) => String(value || "").trim().toUpperCase())
              .filter(Boolean)
          : Object.keys(balances);

        const fallbackCurrency =
          String(result?.currency || result?.nativeCurrency || currencies[0] || "ETH")
            .trim()
            .toUpperCase();

        const nextCurrencies = currencies.length > 0 ? currencies : [fallbackCurrency];
        const nextSelectedCurrency = nextCurrencies.includes(selectedCurrency)
          ? selectedCurrency
          : fallbackCurrency;

        const nextBalance = Number(balances[nextSelectedCurrency]);

        if (!Number.isFinite(nextBalance)) {
          setAccountBalances({});
          setAvailableCurrencies(nextCurrencies);
          setSelectedCurrency(nextSelectedCurrency);
          setBalanceError("Failed to load account balance.");
          return;
        }

        setAccountBalances(balances);
        setAvailableCurrencies(nextCurrencies);
        setSelectedCurrency(nextSelectedCurrency);
      } catch (err) {
        if (!isCancelled) {
          setBalanceError(getUserErrorMessage(err, "Failed to load account balance."));
          setAccountBalances({});
          setAvailableCurrencies([]);
          setSelectedCurrency("");
        }
      } finally {
        if (!isCancelled) {
          setBalanceLoading(false);
        }
      }
    }

    fetchAccountBalance();

    return () => {
      isCancelled = true;
    };
  }, [accountLinked, accountAddress]);

  function closePlusModal() {
    setIsPlusModalOpen(false);
  }

  function openPlusModal() {
    setIsPlusModalOpen(true);
  }

  if (!me && !error) {
    return (
      <PageContainer className="text-gray-600">Loading dashboard...</PageContainer>
    );
  }

  const displayBalance = Number(accountBalances[selectedCurrency]);
  const hasDisplayBalance = Number.isFinite(displayBalance);

  return (
    <PageContainer stack className="pb-32">
      <PageHeader
        title={`Welcome${me ? `, ${me.username}` : ""}`}
        description="Manage your account, friends, and payment activity."
      />

      <PageError>{error}</PageError>

      <section className="grid gap-4 md:grid-cols-3">
        <Link
          to="/account"
          className="rounded-3xl border bg-white p-6 hover:border-purple-300 hover:shadow-sm transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Account</h2>
              <p className="mt-1 text-sm text-gray-600">
                Linked wallet used as your account.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${linkedBadgeClass(
                accountLinked
              )}`}
            >
              {accountLinked ? "Linked" : "Not linked"}
            </span>
          </div>

          <div className="mt-4 space-y-1 text-sm text-gray-700">
            {accountLinked && accountAddress ? (
              <>
                <div className="text-xs">
                  Currency: {selectedCurrency || availableCurrencies[0] || "-"}
                </div>
                <div>
                  Balance:{" "}
                  {balanceLoading
                    ? "Loading..."
                    : hasDisplayBalance
                      ? `${displayBalance.toFixed(4)} ${selectedCurrency}`
                      : "-"}
                </div>
                {balanceError && (
                  <div className="text-xs text-red-600">{balanceError}</div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-600">
                Link your account to enable crypto transfers and top-ups.
              </div>
            )}
          </div>
        </Link>

        <Link
          to="/chat"
          className="rounded-3xl border bg-white p-6 hover:border-purple-300 hover:shadow-sm transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Chat</h2>
              <p className="mt-1 text-sm text-gray-600">
                Open your conversations and messages.
              </p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4.3 3.2A.5.5 0 0 1 4 18.8V6.5Z" />
                <path d="M8 8.5h8M8 11.5h5" />
              </svg>
            </span>
          </div>
        </Link>

        <Link
          to="/friends"
          className="rounded-3xl border bg-white p-6 hover:border-purple-300 hover:shadow-sm transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Friends</h2>
              <p className="mt-1 text-sm text-gray-600">
                Saved recipients for faster transfers.
              </p>
            </div>
            <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
              {friends.length}
            </span>
          </div>

          {friendsError ? (
            <p className="mt-4 text-sm text-red-600">{friendsError}</p>
          ) : friends.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">
              No friends saved yet. Add friends to send money faster.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {friends.slice(0, 3).map((friend) => (
                <div
                  key={friend.id}
                  className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="text-sm font-medium text-gray-900">
                    {friend.label}
                  </div>
                  <div className="text-xs text-gray-500">
                    {friend.username || "No username"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Link>
      </section>

      <section className="rounded-3xl border bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Activity</h2>
            <p className="mt-1 text-sm text-gray-600">
              All your recent transactions in one place.
            </p>
          </div>
          <Link
            to="/transactions"
            className="inline-flex rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700"
          >
            View all
          </Link>
        </div>

        {txError && <div className="mt-3 text-sm text-red-600">{txError}</div>}

        {transactions.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 p-8 text-center">
            <p className="text-lg font-medium text-gray-900">No transactions yet</p>
            <p className="mt-1 text-sm text-gray-600">
              Funding and payments will be shown here.
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y">
            {transactions.map((transaction) => {
              const explorerUrl = getExplorerTxUrl(transaction.txHash);
              const direction =
                String(transaction.direction || "").toLowerCase() === "received"
                  ? "received"
                  : "sent";
              const amountSymbol = String(transaction.assetSymbol || "ETH")
                .trim()
                .toUpperCase();
              const counterpartyLabel = direction === "received" ? "From" : "To";
              const counterpartyUsername =
                direction === "received"
                  ? transaction.senderUsername
                  : transaction.receiverUsername;
              const counterpartyDisplayName =
                direction === "received"
                  ? transaction.senderDisplayName
                  : transaction.receiverDisplayName;
              const counterpartyWallet =
                direction === "received"
                  ? transaction.senderWallet
                  : transaction.receiverWallet;
              const counterpartyValue = counterpartyUsername
                ? `@${counterpartyUsername}`
                : counterpartyDisplayName || counterpartyWallet || "-";
              const counterpartyValueClass = counterpartyUsername || counterpartyDisplayName
                ? "mt-1 text-xs text-gray-600"
                : "mt-1 text-xs text-gray-600 font-mono";

              return (
                <Link
                  key={transaction.id}
                  to={`/transactions/${transaction.id}`}
                  className="flex items-start justify-between gap-4 rounded-lg px-2 py-3 hover:bg-gray-50"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {direction === "received" ? "Received" : "Sent"}{" "}
                      {transaction.amount} {amountSymbol}
                      {typeof transaction.fiatAmountUsd === "number" && (
                        <span className="ml-1 text-xs text-gray-500">
                          (~ {transaction.fiatAmountUsd.toFixed(2)}{" "}
                          {transaction.fiatCurrency || "USD"})
                        </span>
                      )}
                    </div>
                    <div className={counterpartyValueClass}>
                      {counterpartyLabel}: {counterpartyValue}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {formatDateTime(transaction.createdAt) || "-"}
                    </div>
                    {explorerUrl && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openExternalUrl(explorerUrl);
                        }}
                        className="mt-1 text-[11px] text-blue-600 hover:underline"
                      >
                        View on BscScan
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${directionBadgeClasses(
                        direction
                      )}`}
                    >
                      {direction === "received" ? "Received" : "Sent"}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClasses(
                        transaction.status
                      )}`}
                    >
                      {transaction.status}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 px-4">
        <div className="pointer-events-auto mx-auto flex w-full max-w-xl items-center rounded-full bg-white/95 p-2 shadow-2xl ring-1 ring-purple-200 backdrop-blur">
          <button
            type="button"
            onClick={() => navigate("/request")}
            className="flex-1 rounded-full bg-purple-100 px-4 py-3 text-sm font-semibold text-purple-700 transition hover:bg-purple-200"
          >
            Request
          </button>

          <button
            type="button"
            onClick={openPlusModal}
            className={`mx-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none transition ${
              isPlusModalOpen
                ? "bg-indigo-600 text-white"
                : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            }`}
            aria-label="Open quick account actions"
          >
            +
          </button>

          <button
            type="button"
            onClick={() => navigate("/send")}
            className="flex-1 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:from-purple-700 hover:to-indigo-700"
          >
            Send
          </button>
        </div>
      </div>

      {isPlusModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
          onClick={closePlusModal}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-purple-100 bg-white p-6 text-gray-900 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Quick account actions</h2>
              <button
                type="button"
                onClick={closePlusModal}
                className="text-sm text-gray-500 hover:text-gray-800"
                aria-label="Close quick actions modal"
              >
                X
              </button>
            </div>

            <p className="mt-1 text-sm text-gray-600">
              Buy, sell, convert, deposit, and withdraw.
            </p>
            <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              Coming soon
            </p>

            <div className="mt-4 space-y-2">
              {QUICK_PLUS_ACTIONS.map((action) => (
                <div
                  key={action.id}
                  className="w-full cursor-not-allowed rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left opacity-80"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${quickActionIconClasses(
                        action.id
                      )}`}
                    >
                      {quickActionIcon(action.id)}
                    </span>
                    <div className="text-lg font-medium">{action.label}</div>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {action.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
