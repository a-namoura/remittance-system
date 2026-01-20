import { useEffect, useState } from "react";
import { apiRequest } from "../services/api.js";
import ConnectWalletButton from "../components/ConnectWalletButton.jsx";
import { getMyTransactions } from "../services/transactionApi.js";

function badgeClass(ok) {
  return ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700";
}

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  // local UI state: wallet link status (updated by ConnectWalletButton)
  const [walletLinked, setWalletLinked] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [txError, setTxError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    apiRequest("/api/me", { token })
      .then((data) => setMe(data.user))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    getMyTransactions({ token, limit: 10 })
    .then((data) => setTransactions(data.transactions || []))
    .catch((err) => setTxError(err.message));
  }, []);

  if (!me && !error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10 text-gray-600">
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* Header (clean: title only) */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-600 mt-1">
          Account overview and wallet setup.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-100 text-red-700">
          {error}
        </div>
      )}

      {/* Top grid: Account status + Primary action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            <span className={`text-xs px-3 py-1 rounded-full ${badgeClass(true)}`}>
              Active
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm text-gray-800">
            <div>
              <span className="text-gray-600">Signed in as:</span>{" "}
              <span className="font-medium">{me.email}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-600">Wallet:</span>
              <span
                className={`text-xs px-2 py-1 rounded-full ${badgeClass(walletLinked)}`}
              >
                {walletLinked ? "Linked" : "Not linked"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-600">Remittances:</span>
              <span
                className={`text-xs px-2 py-1 rounded-full ${badgeClass(walletLinked)}`}
              >
                {walletLinked ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>

          {!walletLinked && (
            <div className="mt-4 text-xs text-gray-600 bg-gray-50 border rounded-md p-3">
              To enable remittances, connect your wallet and verify ownership.
            </div>
          )}
        </div>

        {/* Primary Action: Send Money */}
        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-start justify-between">
            <button
              type="button"
              disabled={!walletLinked}
              onClick={() => window.location.href = "/send"}
              className="
                mt-4 w-full py-2 rounded-md font-semibold
                bg-blue-600 text-white
                hover:bg-blue-700 active:scale-95 transition-all
                disabled:bg-gray-200 disabled:text-gray-500 disabled:hover:bg-gray-200 disabled:active:scale-100
              "
            >
              {walletLinked ? "Send Money" : "Complete wallet setup"}
            </button>
          </div>

          {!walletLinked && (
            <p className="text-xs text-gray-600 mt-3">
              Link your wallet below to unlock this feature.
            </p>
          )}
        </div>
      </div>

      {/* Wallet setup (single section; no duplication) */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Wallet Setup</h2>
            <p className="text-xs text-gray-500 mt-1">
              Connect and verify ownership (signature) to link your wallet to this account.
            </p>
          </div>

          <span className={`text-xs px-3 py-1 rounded-full ${badgeClass(walletLinked)}`}>
            {walletLinked ? "Linked" : "Not linked"}
          </span>
        </div>

        <div className="mt-4">
          {/* IMPORTANT: this component should NOT render its own header/badge anymore */}
          <ConnectWalletButton onLinked={() => setWalletLinked(true)} />
        </div>
      </div>

      {/* Activity */}
      <div className="rounded-2xl border bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">
          Recent Activity
        </h2>
        {txError && <div className="text-sm text-red-600 mb-3">{txError}</div>}
        
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-600">
            No transactions yet. Once you send a remittance, it will appear here.
            </p>
            ) : (
            <div className="divide-y">
              {transactions.map((t) => (
                <div key={t.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      Sent {t.amount} ETH
                    </div>
                    <div className="text-xs text-gray-600 font-mono mt-1">
                      To: {t.receiverWallet}
                    </div>
                    {t.txHash && (
                    <div className="text-xs text-gray-500 font-mono mt-1">
                      Tx: {t.txHash.slice(0, 10)}...{t.txHash.slice(-8)}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(t.createdAt).toLocaleString()}
                  </div>
              </div>

        <span
          className={`text-xs px-3 py-1 rounded-full ${
            t.status === "success"
              ? "bg-green-100 text-green-700"
              : t.status === "failed"
              ? "bg-red-100 text-red-700"
              : "bg-yellow-100 text-yellow-800"
          }`}
        >
          {t.status}
        </span>
      </div>
    ))}
  </div>
)}

      </div>
    </div>
  );
}
