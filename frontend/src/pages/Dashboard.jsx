import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api.js";
import ConnectWalletButton from "../components/ConnectWalletButton.jsx";
import { getMyTransactions } from "../services/transactionApi.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { formatDateTime } from "../utils/datetime.js";

function badgeClass(ok) {
  return ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700";
}

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  const [walletLinked, setWalletLinked] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  const [walletBalance, setWalletBalance] = useState(null);
  const [balanceError, setBalanceError] = useState("");

  const [transactions, setTransactions] = useState([]);
  const [txError, setTxError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    apiRequest("/api/me", { token })
      .then((data) => setMe(data.user))
      .catch((err) => {
        setError(err.message);
        if (err.status === 401 || err.status === 403) {
          localStorage.removeItem("token");
          navigate("/login", { replace: true });
        }
      });
  }, [navigate]);

  useEffect(() => {
    if (!me) return;

    const connectedKey = `walletConnected_${me.id}`;
    const addressKey = `walletAddress_${me.id}`;

    const storedLinked = localStorage.getItem(connectedKey) === "1";
    const storedAddress = localStorage.getItem(addressKey) || "";

    setWalletLinked(storedLinked);
    setWalletAddress(storedAddress);
  }, [me]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    getMyTransactions({ token, limit: 5 })
      .then((data) => setTransactions(data.transactions || []))
      .catch((err) => setTxError(err.message));
  }, []);

  // Fetch wallet balance when wallet changes
  useEffect(() => {
    async function fetchBalance() {
      if (!walletLinked || !walletAddress) {
        setWalletBalance(null);
        setBalanceError("");
        return;
      }

      if (!window.ethereum) {
        setBalanceError("Wallet provider not available to fetch balance.");
        setWalletBalance(null);
        return;
      }

      try {
        setBalanceError("");

        const provider = new ethers.BrowserProvider(window.ethereum);
        const balanceBigInt = await provider.getBalance(walletAddress);
        const balanceEth = Number(ethers.formatEther(balanceBigInt));

        setWalletBalance(balanceEth);
      } catch (err) {
        console.error("Failed to fetch balance", err);
        setBalanceError("Failed to load wallet balance.");
        setWalletBalance(null);
      }
    }

    fetchBalance();
  }, [walletLinked, walletAddress]);

  if (!me && !error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10 text-gray-600">
        Loading dashboard…
      </div>
    );
  }

  const connectedKey = me ? `walletConnected_${me.id}` : null;
  const addressKey = me ? `walletAddress_${me.id}` : null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome{me ? `, ${me.username}` : ""}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          View your account status, link your wallet, and track recent transactions.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Status */}
        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Account Status
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Basic identity and readiness to send transactions.
              </p>
            </div>

            <span
              className={`text-xs px-3 py-1 rounded-full ${badgeClass(true)}`}
            >
              Active
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm text-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Wallet:</span>
              <span
                className={`text-xs px-3 py-1 rounded-full ${badgeClass(
                  walletLinked
                )}`}
              >
                {walletLinked ? "Linked" : "Not linked"}
              </span>
            </div>

            {walletLinked && walletAddress && (
              <div className="text-xs text-gray-600 mt-2">
                <div className="font-mono break-all">
                  Address: {walletAddress}
                </div>
                <div className="mt-1">
                  Balance:{" "}
                  {walletBalance == null
                    ? "Loading..."
                    : `${walletBalance.toFixed(4)} ETH`}
                </div>
                {balanceError && (
                  <div className="mt-1 text-red-600">{balanceError}</div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              To send a transaction, you must have a linked wallet with funds.
            </div>
            <Link
              to={walletLinked ? "/send" : "#"}
              className={`
                inline-flex items-center justify-center px-3 py-1.5 rounded-md
                text-xs font-semibold
                ${
                  walletLinked
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none"
                }
              `}
            >
              {walletLinked ? "Send Money" : "Complete wallet setup"}
            </Link>
          </div>
        </div>

        {/* Wallet Setup */}
        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Wallet Setup
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Connect and verify ownership (signature) to link your wallet to
                this account.
              </p>
            </div>

            <span
              className={`text-xs px-3 py-1 rounded-full ${badgeClass(
                walletLinked
              )}`}
            >
              {walletLinked ? "Linked" : "Not linked"}
            </span>
          </div>

          <div className="mt-4">
            <ConnectWalletButton
              connected={walletLinked}
              onLinked={(address) => {
                setWalletLinked(true);
                setWalletAddress(address);
                setWalletBalance(null);

                if (me && connectedKey && addressKey) {
                  localStorage.setItem(connectedKey, "1");
                  localStorage.setItem(addressKey, address);
                }
              }}
              onDisconnected={() => {
                setWalletLinked(false);
                setWalletAddress("");
                setWalletBalance(null);

                if (me && connectedKey && addressKey) {
                  localStorage.removeItem(connectedKey);
                  localStorage.removeItem(addressKey);
                }
              }}
            />
          </div>

          {!walletLinked && (
            <p className="text-xs text-gray-600 mt-3">
              Link your wallet above to unlock sending transactions and tracking
              balances.
            </p>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Recent Transactions
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              A quick view of your last transactions.
            </p>
          </div>
        </div>

        {txError && (
          <div className="text-sm text-red-600 mb-3">{txError}</div>
        )}

        {transactions.length === 0 ? (
          <p className="text-sm text-gray-600">
            No transactions yet. Once you send a transaction, it will appear
            here.
          </p>
        ) : (
          <>
            <div className="divide-y">
              {transactions.map((t) => {
                const explorerUrl = getExplorerTxUrl(t.txHash);

                return (
                  <Link
                    key={t.id}
                    to={`/transactions/${t.id}`}
                    className="py-3 flex items-start justify-between gap-4 hover:bg-gray-50 rounded-lg px-2 -mx-2 cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {t.amount} ETH
                        {typeof t.fiatAmountUsd === "number" && (
                          <span className="text-xs text-gray-500 ml-1">
                            (~ {t.fiatAmountUsd.toFixed(2)}{" "}
                            {t.fiatCurrency || "USD"})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 font-mono mt-1">
                        To: {t.receiverWallet}
                      </div>
                      {t.txHash && (
                        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                          <div className="font-mono">
                            Tx: {t.txHash.slice(0, 10)}…{t.txHash.slice(-8)}
                          </div>
                          {explorerUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(explorerUrl, "_blank", "noreferrer");
                              }}
                              className="text-[11px] text-blue-600 hover:underline"
                            >
                              View on BscScan
                            </button>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDateTime(t.createdAt) || "—"}
                      </div>
                    </div>

                    <span
                      className={`text-xs px-3 py-1 rounded-full ${statusBadgeClasses(
                        t.status
                      )}`}
                    >
                      {t.status}
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-3 text-right">
              <Link
                to="/transactions"
                className="text-xs text-blue-600 hover:underline"
              >
                View all transactions
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
