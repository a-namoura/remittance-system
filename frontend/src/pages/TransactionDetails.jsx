import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BackButton from "../components/BackButton.jsx";
import { getTransactionById } from "../services/transactionApi.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { formatDateTime } from "../utils/datetime.js";

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
}

export default function TransactionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tx, setTx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setError("You are not logged in.");
          setLoading(false);
          return;
        }

        setLoading(true);
        setError("");

        const data = await getTransactionById({ token, id });
        setTx(data.transaction);
      } catch (err) {
        setError(err.message || "Failed to load transaction.");
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      load();
    } else {
      setError("Missing transaction id.");
      setLoading(false);
    }
  }, [id]);

  function formatEth(value) {
    if (typeof value !== "number") return "—";
    return `${value} ETH`;
  }

  function formatUsd(value, currency) {
    if (typeof value !== "number") return "—";
    return `${value.toFixed(2)} ${currency || "USD"}`;
  }

  const explorerUrl = tx ? getExplorerTxUrl(tx.txHash) : null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="mb-2">
        <BackButton fallback="/transactions" />
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Transaction Details
      </h1>
      <p className="text-sm text-gray-600">
        View the full record for a single remittance transaction.
      </p>

      {loading && (
        <p className="text-sm text-gray-500 mt-4">Loading transaction…</p>
      )}

      {error && !loading && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && !tx && (
        <div className="mt-4 text-sm text-gray-500">No transaction found.</div>
      )}

      {!loading && !error && tx && (
        <div className="mt-6 rounded-2xl border bg-white p-6 space-y-6">
          {/* Top row: amount + status */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Amount
              </div>
              <div className="text-2xl font-semibold text-gray-900">
                {formatEth(tx.amount)}
              </div>
              {typeof tx.fiatAmountUsd === "number" && (
                <div className="text-xs text-gray-500 mt-1">
                  ~ {formatUsd(tx.fiatAmountUsd, tx.fiatCurrency)}
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusBadgeClasses(
                  tx.status
                )}`}
              >
                {tx.status}
              </span>
              {tx.type && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700">
                  {tx.type === "sent" ? "Sent" : "Received"}
                </span>
              )}
            </div>
          </div>

          {/* Wallets */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Sender Wallet</div>
              <div className="font-mono text-sm break-all text-gray-900">
                {tx.senderWallet}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-500">Receiver Wallet</div>
              <div className="font-mono text-sm break-all text-gray-900">
                {tx.receiverWallet}
              </div>
            </div>
          </div>

          {/* Tx hash */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500">Transaction Hash</div>
            {tx.txHash ? (
              <div className="space-y-1">
                <div className="font-mono text-xs break-all text-gray-900">
                  {tx.txHash}
                </div>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View on BscScan
                  </a>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Not available.</div>
            )}
          </div>

          {/* Dates */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Created at</div>
              <div className="text-sm text-gray-900">
                {formatDateTime(tx.createdAt) || "—"}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Last updated</div>
              <div className="text-sm text-gray-900">
                {formatDateTime(tx.updatedAt) || "—"}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate("/transactions")}
              className="text-sm text-blue-600 hover:underline"
            >
              Back to history
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
