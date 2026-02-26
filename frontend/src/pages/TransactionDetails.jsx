import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer, PageError, PageHeader } from "../components/PageLayout.jsx";
import { getTransactionById } from "../services/transactionApi.js";
import { requireAuthToken } from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { openExternalUrl } from "../utils/security.js";

import { getUserErrorMessage } from "../utils/userError.js";
function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
}

function formatAssetAmount(value, assetSymbol) {
  if (typeof value !== "number") return "-";
  const symbol = String(assetSymbol || "ETH").trim().toUpperCase() || "ETH";
  return `${value} ${symbol}`;
}

function formatUsd(value, currency) {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(2)} ${currency || "USD"}`;
}

export default function TransactionDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadTransaction() {
      const token = requireAuthToken({
        message: "You are not logged in.",
        onMissing: (message) => {
          if (!isCancelled) {
            setError(message);
            setLoading(false);
          }
        },
      });
      if (!token) {
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
        setError(getUserErrorMessage(err, "Failed to load transaction."));
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
  const senderPrimaryValue = transaction
    ? transaction.senderUsername
      ? `@${transaction.senderUsername}`
      : transaction.senderDisplayName || transaction.senderWallet || "-"
    : "-";
  const receiverPrimaryValue = transaction
    ? transaction.receiverUsername
      ? `@${transaction.receiverUsername}`
      : transaction.receiverDisplayName || transaction.receiverWallet || "-"
    : "-";
  const showSenderSecondaryWallet = Boolean(
    transaction?.senderWallet &&
      (transaction?.senderUsername || transaction?.senderDisplayName)
  );
  const showReceiverSecondaryWallet = Boolean(
    transaction?.receiverWallet &&
      (transaction?.receiverUsername || transaction?.receiverDisplayName)
  );

  return (
    <PageContainer stack>
      <button
        type="button"
        onClick={() => navigate("/transactions")}
        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18 9 12l6-6" />
        </svg>
        Back to Activity
      </button>

      <PageHeader
        title="Transaction Details"
        description="View the full record for a single transaction."
      />

      {loading && <p className="text-sm text-gray-500 mt-4">Loading transaction...</p>}

      {!loading ? <PageError className="mt-4">{error}</PageError> : null}

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
                {formatAssetAmount(transaction.amount, transaction.assetSymbol)}
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
              {(transaction.direction || transaction.type) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700">
                  {String(transaction.direction || transaction.type).toLowerCase() ===
                  "received"
                    ? "Received"
                    : "Sent"}
                </span>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Sender</div>
              <div
                className={`text-sm text-gray-900 ${
                  showSenderSecondaryWallet ? "" : "font-mono break-all"
                }`}
              >
                {senderPrimaryValue}
              </div>
              {showSenderSecondaryWallet && (
                <div className="font-mono text-[11px] break-all text-gray-500">
                  {transaction.senderWallet}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-500">Receiver</div>
              <div
                className={`text-sm text-gray-900 ${
                  showReceiverSecondaryWallet ? "" : "font-mono break-all"
                }`}
              >
                {receiverPrimaryValue}
              </div>
              {showReceiverSecondaryWallet && (
                <div className="font-mono text-[11px] break-all text-gray-500">
                  {transaction.receiverWallet}
                </div>
              )}
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
        </div>
      )}
    </PageContainer>
  );
}
