import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyTransactions } from "../services/transactionApi.js";
import { getAuthToken } from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { openExternalUrl } from "../utils/security.js";

import { getUserErrorMessage } from "../utils/userError.js";
const PAGE_LIMIT = 10;

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
}

function directionBadgeClasses(direction) {
  if (direction === "received") return "bg-blue-100 text-blue-700";
  return "bg-purple-100 text-purple-700";
}

function normalizeDirection(value) {
  return String(value || "").toLowerCase() === "received" ? "received" : "sent";
}

export default function Transactions() {
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    status: "all",
    direction: "all",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const todayDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_LIMIT)),
    [total]
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadTransactions() {
      const token = getAuthToken();
      if (!token) {
        if (!isCancelled) {
          setError("You are not logged in.");
          setTransactions([]);
          setTotal(0);
        }
        return;
      }

      try {
        setLoading(true);
        setError("");

        const data = await getMyTransactions({
          token,
          limit: PAGE_LIMIT,
          page,
          status:
            appliedFilters.status === "all" ? undefined : appliedFilters.status,
          view:
            appliedFilters.direction === "all"
              ? undefined
              : appliedFilters.direction,
          from: appliedFilters.from || undefined,
          to: appliedFilters.to || undefined,
        });

        if (isCancelled) return;
        setTransactions(data.transactions || []);
        setTotal(data.total || 0);
      } catch (err) {
        if (isCancelled) return;
        setError(getUserErrorMessage(err, "Failed to load transactions."));
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadTransactions();

    return () => {
      isCancelled = true;
    };
  }, [page, appliedFilters]);

  function applyFilters(event) {
    event.preventDefault();
    setError("");

    if (from && from > todayDate) {
      setError("From date cannot be in the future.");
      return;
    }

    if (to && to > todayDate) {
      setError("To date cannot be in the future.");
      return;
    }

    if (from && to && from > to) {
      setError("From date cannot be later than To date.");
      return;
    }

    setPage(1);
    setAppliedFilters({ status, direction, from, to });
  }

  function handlePrev() {
    setPage((current) => Math.max(1, current - 1));
  }

  function handleNext() {
    setPage((current) => Math.min(totalPages, current + 1));
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 pb-28">
      <section className="rounded-3xl border bg-white p-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Activity</h1>
          <p className="mt-1 text-sm text-gray-600">
            All your recent transactions in one place.
          </p>
        </div>

        <form
          onSubmit={applyFilters}
          className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Status
            </label>
            <select
              className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Direction
            </label>
            <select
              className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm"
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
            >
              <option value="all">All</option>
              <option value="sent">Sent</option>
              <option value="received">Received</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              From date
            </label>
            <input
              type="date"
              max={todayDate}
              className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              To date
            </label>
            <input
              type="date"
              max={todayDate}
              className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>

          <button
            type="submit"
            className="ml-auto rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
          >
            Apply
          </button>
        </form>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

        {loading ? (
          <div className="mt-6 text-sm text-gray-600">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 p-8 text-center">
            <p className="text-lg font-medium text-gray-900">No transactions yet</p>
            <p className="mt-1 text-sm text-gray-600">
              Funding and payments will be shown here.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {transactions.map((transaction) => {
              const direction = normalizeDirection(
                transaction.direction || transaction.type
              );
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
                ? "mt-1 text-xs text-gray-700"
                : "mt-1 font-mono text-xs text-gray-700";
              const assetSymbol = String(transaction.assetSymbol || "ETH")
                .trim()
                .toUpperCase();
              const explorerUrl = getExplorerTxUrl(transaction.txHash);

              return (
                <article
                  key={transaction.id}
                  className="cursor-pointer rounded-2xl border border-gray-200 px-4 py-4 transition hover:border-purple-300 hover:bg-gray-50"
                  onClick={() => navigate(`/transactions/${transaction.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/transactions/${transaction.id}`);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {direction === "received" ? "Received" : "Sent"}{" "}
                        {transaction.amount} {assetSymbol}
                        {typeof transaction.fiatAmountUsd === "number" && (
                          <span className="ml-1 font-normal text-gray-500">
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
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && transactions.length > 0 && (
          <div className="mt-5 flex items-center justify-between text-xs text-gray-600">
            <div>
              Page {page} of {totalPages} - {total} transaction
              {total === 1 ? "" : "s"}
            </div>
            <div className="space-x-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={page === 1}
                className="rounded-full border border-gray-200 px-3 py-1.5 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={page === totalPages}
                className="rounded-full border border-gray-200 px-3 py-1.5 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
