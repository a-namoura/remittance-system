import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { Link, useNavigate } from "react-router-dom";
import { getCurrentUser } from "../services/authApi.js";
import { listFriends } from "../services/friendApi.js";
import { getMyTransactions } from "../services/transactionApi.js";
import {
  clearSessionStorage,
  getAuthToken,
  readWalletState,
} from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { openExternalUrl } from "../utils/security.js";

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
}

function linkedBadgeClass(linked) {
  return linked ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700";
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  const [accountLinked, setAccountLinked] = useState(false);
  const [accountAddress, setAccountAddress] = useState("");
  const [accountBalance, setAccountBalance] = useState(null);
  const [balanceError, setBalanceError] = useState("");

  const [friends, setFriends] = useState([]);
  const [friendsError, setFriendsError] = useState("");

  const [transactions, setTransactions] = useState([]);
  const [txError, setTxError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadDashboard() {
      const token = getAuthToken();
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
          return;
        }

        const walletState = readWalletState(user.id);
        setAccountLinked(walletState.linked);
        setAccountAddress(walletState.address);
      } catch (err) {
        if (isCancelled) return;
        setError(err.message || "Failed to load dashboard.");

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
      const token = getAuthToken();
      if (!token) return;

      try {
        setFriendsError("");
        const data = await listFriends({ token });
        if (isCancelled) return;
        setFriends(data.friends || []);
      } catch (err) {
        if (isCancelled) return;
        setFriendsError(err.message || "Failed to load friends.");
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
      const token = getAuthToken();
      if (!token) return;

      try {
        setTxError("");
        const data = await getMyTransactions({ token, limit: 12 });
        if (isCancelled) return;
        setTransactions(data.transactions || []);
      } catch (err) {
        if (isCancelled) return;
        setTxError(err.message || "Failed to load activity.");
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
          setAccountBalance(null);
          setBalanceError("");
        }
        return;
      }

      if (!window.ethereum) {
        if (!isCancelled) {
          setBalanceError("Wallet provider not available to fetch balance.");
        }
        return;
      }

      try {
        setBalanceError("");
        const provider = new ethers.BrowserProvider(window.ethereum);
        const balanceBigInt = await provider.getBalance(accountAddress);
        if (isCancelled) return;
        setAccountBalance(Number(ethers.formatEther(balanceBigInt)));
      } catch {
        if (!isCancelled) {
          setBalanceError("Failed to load account balance.");
          setAccountBalance(null);
        }
      }
    }

    fetchAccountBalance();

    return () => {
      isCancelled = true;
    };
  }, [accountLinked, accountAddress]);

  if (!me && !error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10 text-gray-600">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome{me ? `, ${me.username}` : ""}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your account, friends, and payment activity.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          to="/account"
          className="rounded-3xl border bg-white p-6 hover:border-purple-300 hover:shadow-sm transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Account</h2>
              <p className="mt-1 text-sm text-gray-600">
                Linked wallet used as your remittance account.
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
                <div className="font-mono text-xs break-all">{accountAddress}</div>
                <div>
                  Balance:{" "}
                  {accountBalance == null
                    ? "Loading..."
                    : `${accountBalance.toFixed(4)} ETH`}
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

          <div className="mt-4 inline-flex rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white">
            Add money
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

          <div className="mt-4 inline-flex rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white">
            Open friends
          </div>
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
            className="text-xs font-medium text-purple-600 hover:underline"
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
            <Link
              to="/account"
              className="mt-4 inline-flex rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Add money
            </Link>
          </div>
        ) : (
          <div className="mt-4 divide-y">
            {transactions.map((transaction) => {
              const explorerUrl = getExplorerTxUrl(transaction.txHash);
              return (
                <Link
                  key={transaction.id}
                  to={`/transactions/${transaction.id}`}
                  className="flex items-start justify-between gap-4 rounded-lg px-2 py-3 hover:bg-gray-50"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {transaction.amount} ETH
                      {typeof transaction.fiatAmountUsd === "number" && (
                        <span className="ml-1 text-xs text-gray-500">
                          (~ {transaction.fiatAmountUsd.toFixed(2)}{" "}
                          {transaction.fiatCurrency || "USD"})
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-600 font-mono">
                      To: {transaction.receiverWallet}
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

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClasses(
                      transaction.status
                    )}`}
                  >
                    {transaction.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
