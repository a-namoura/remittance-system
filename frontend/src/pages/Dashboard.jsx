import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { apiRequest } from "../services/api.js";
import ConnectWalletButton from "../components/ConnectWalletButton.jsx";
import { getMyTransactions } from "../services/transactionApi.js";

function badgeClass(ok) {
  return ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700";
}

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
}

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  const [walletLinked, setWalletLinked] = useState(() => {
    return localStorage.getItem("walletConnected") === "1";
  });

  const [walletAddress, setWalletAddress] = useState(() => {
    return localStorage.getItem("walletAddress") || "";
  });

  const [walletBalance, setWalletBalance] = useState(null);
  const [balanceError, setBalanceError] = useState("");

  const [transactions, setTransactions] = useState([]);
  const [txError, setTxError] = useState("");

  // Load current user
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    apiRequest("/api/me", { token })
      .then((data) => setMe(data.user))
      .catch((err) => setError(err.message));
  }, []);

  // Load recent transactions
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    getMyTransactions({ token, limit: 5 })
      .then((data) => setTransactions(data.transactions || []))
      .catch((err) => setTxError(err.message));
  }, []);

  // Load on-chain wallet balance when linked
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome{me ? `, ${me.username}` : ""} 👋
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          View your account status, link your wallet, and track recent
          remittances.
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
                Basic identity and readiness to send remittances.
              </p>
            </div>

            <span
              className={`text-xs px-3 py-1 rounded-full ${badgeClass(true)}`}
            >
              Active
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm text-gray-800">
            <div>
              <span className="text-gray-600">Signed in as:</span>{" "}
              <span className="font-medium">{me?.email}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-600">Role:</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                {me?.role || "user"}
              </span>
            </div>

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
              To send a remittance, you must have a linked wallet with funds.
            </div>
            <a
              href={walletLinked ? "/send" : "#"}
              className={`
                inline-flex items-center justify-center px-3 py-1.5 rounded-md
                text-xs font-semibold
                ${
                  walletLinked
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }
              `}
            >
              {walletLinked ? "Send Money" : "Complete wallet setup"}
            </a>
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
                localStorage.setItem("walletConnected", "1");
                localStorage.setItem("walletAddress", address);
              }}
              onDisconnected={() => {
                setWalletLinked(false);
                setWalletAddress("");
                setWalletBalance(null);
                localStorage.removeItem("walletConnected");
                localStorage.removeItem("walletAddress");
              }}
            />
          </div>

          {!walletLinked && (
            <p className="text-xs text-gray-600 mt-3">
              Link your wallet above to unlock sending remittances and tracking
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
              A quick view of your last remittances.
            </p>
          </div>
        </div>

        {txError && (
          <div className="text-sm text-red-600 mb-3">{txError}</div>
        )}

        {transactions.length === 0 ? (
          <p className="text-sm text-gray-600">
            No transactions yet. Once you send a remittance, it will appear
            here.
          </p>
        ) : (
          <>
            <div className="divide-y">
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className="py-3 flex items-start justify-between gap-4"
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
                      <div className="text-xs text-gray-500 font-mono mt-1">
                        Tx: {t.txHash.slice(0, 10)}…{t.txHash.slice(-8)}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(t.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <span
                    className={`text-xs px-3 py-1 rounded-full ${statusBadgeClasses(
                      t.status
                    )}`}
                  >
                    {t.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 text-right">
              <a
                href="/transactions"
                className="text-xs text-blue-600 hover:underline"
              >
                View all transactions
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
