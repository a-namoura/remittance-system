import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BackButton from "../components/BackButton.jsx";
import { getTransactionById } from "../services/transactionApi.js";
import { getAuthToken } from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { openExternalUrl } from "../utils/security.js";

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
}

function formatEth(value) {
  if (typeof value !== "number") return "-";
  return `${value} ETH`;
}

function formatUsd(value, currency) {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(2)} ${currency || "USD"}`;
}

export default function TransactionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadTransaction() {
      const token = getAuthToken();
      if (!token) {
        if (!isCancelled) {
          setError("You are not logged in.");
          setLoading(false);
        }
        return;
      }

      if (!id) {
        if (!isCancelled) {
          setError("Missing transaction id.");
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError("");

        const data = await getTransactionById({ token, id });
        if (isCancelled) return;
        setTransaction(data.transaction || null);
      } catch (err) {
        if (isCancelled) return;
        setError(err.message || "Failed to load transaction.");
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadTransaction();

    return () => {
      isCancelled = true;
    };
  }, [id]);

  const explorerUrl = transaction
    ? getExplorerTxUrl(transaction.txHash)
    : null;

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

      {loading && <p className="text-sm text-gray-500 mt-4">Loading transaction...</p>}

      {error && !loading && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && !transaction && (
        <div className="mt-4 text-sm text-gray-500">No transaction found.</div>
      )}

      {!loading && !error && transaction && (
        <div className="mt-6 rounded-2xl border bg-white p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Amount
              </div>
              <div className="text-2xl font-semibold text-gray-900">
                {formatEth(transaction.amount)}
              </div>
              {typeof transaction.fiatAmountUsd === "number" && (
                <div className="text-xs text-gray-500 mt-1">
                  ~ {formatUsd(transaction.fiatAmountUsd, transaction.fiatCurrency)}
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusBadgeClasses(
                  transaction.status
                )}`}
              >
                {transaction.status}
              </span>
              {transaction.type && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700">
                  {transaction.type === "sent" ? "Sent" : "Received"}
                </span>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Sender Wallet</div>
              <div className="font-mono text-sm break-all text-gray-900">
                {transaction.senderWallet}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-500">Receiver Wallet</div>
              <div className="font-mono text-sm break-all text-gray-900">
                {transaction.receiverWallet}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-gray-500">Transaction Hash</div>
            {transaction.txHash ? (
              <div className="space-y-1">
                <div className="font-mono text-xs break-all text-gray-900">
                  {transaction.txHash}
                </div>
                {explorerUrl && (
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => openExternalUrl(explorerUrl)}
                  >
                    View on BscScan
                  </button>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Not available.</div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Created at</div>
              <div className="text-sm text-gray-900">
                {formatDateTime(transaction.createdAt) || "-"}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Last updated</div>
              <div className="text-sm text-gray-900">
                {formatDateTime(transaction.updatedAt) || "-"}
              </div>
            </div>
          </div>

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
