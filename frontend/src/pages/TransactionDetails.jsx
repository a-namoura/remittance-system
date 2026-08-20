import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  PageContainer,
  PageError,
  PageHeader,
  PageLoading,
} from "../components/PageLayout.jsx";
import { cancelTransaction, getTransactionById } from "../services/transactionApi.js";
import { requireAuthToken } from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";
import { displayCurrency } from "../utils/currency.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { openExternalUrl } from "../utils/security.js";
import { downloadTransactionReceipt } from "../utils/transactionReceipt.js";
import CopyableWalletAddress from "../components/CopyableWalletAddress.jsx";
import BackButton from "../components/BackButton.jsx";

import { getUserErrorMessage } from "../utils/userError.js";
function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "cancelled") return "bg-gray-100 text-gray-700";
  return "bg-yellow-100 text-yellow-800";
}

function formatAssetAmount(value, assetSymbol) {
  if (typeof value !== "number") return "-";
  const symbol = displayCurrency(assetSymbol);
  return `${value} ${symbol}`;
}

function formatUsd(value, currency) {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(2)} ${currency || "USD"}`;
}

export default function TransactionDetails() {
  const { id } = useParams();

  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [receiptError, setReceiptError] = useState("");

  function handleDownloadReceipt() {
    try {
      setReceiptError("");
      downloadTransactionReceipt(transaction);
    } catch (err) {
      setReceiptError(getUserErrorMessage(err, "Failed to create the receipt."));
    }
  }

  async function handleCancel() {
    if (!transaction?.canCancel || cancelling) return;
    const token = requireAuthToken({ message: "You are not logged in.", onMissing: setError });
    if (!token) return;

    try {
      setCancelling(true);
      setError("");
      const data = await cancelTransaction({ token, id: transaction.id });
      setTransaction((current) => ({ ...current, ...data.transaction }));
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to cancel transfer."));
    } finally {
      setCancelling(false);
    }
  }

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
      <div><BackButton to="/transactions" label="Back to Activity" /></div>

      <PageHeader
        title="Transaction Details"
        description="View the full record for a single transaction."
      />

      {loading && <PageLoading className="mt-4">Loading transaction...</PageLoading>}

      {!loading ? <PageError className="mt-4">{error}</PageError> : null}

      <PageError className="mt-4">{receiptError}</PageError>

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
              {transaction.canCancel && (
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleCancel}
                  className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelling ? "Cancelling..." : "Cancel transfer"}
                </button>
              )}
              {String(transaction.status || "").toLowerCase() === "success" && (
                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 15.5h12" />
                  </svg>
                  Download receipt (PDF)
                </button>
              )}
            </div>
          </div>

          {transaction.status === "pending" && transaction.reconciliationError && (
            <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">
              <div className="font-semibold">Confirmation pending</div>
              <div className="mt-1">
                {transaction.reconciliationError}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Sender</div>
              {showSenderSecondaryWallet ? <div className="text-sm text-gray-900">{senderPrimaryValue}</div> : <CopyableWalletAddress address={transaction.senderWallet} label="" className="p-1 text-sm text-gray-900" />}
              {showSenderSecondaryWallet && (
                <CopyableWalletAddress address={transaction.senderWallet} label="" className="p-1 text-[11px] text-gray-500" />
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-500">Receiver</div>
              {showReceiverSecondaryWallet ? <div className="text-sm text-gray-900">{receiverPrimaryValue}</div> : <CopyableWalletAddress address={transaction.receiverWallet} label="" className="p-1 text-sm text-gray-900" />}
              {showReceiverSecondaryWallet && (
                <CopyableWalletAddress address={transaction.receiverWallet} label="" className="p-1 text-[11px] text-gray-500" />
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
