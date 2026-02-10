import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackButton from "../components/BackButton.jsx";
import { getMyTransactions } from "../services/transactionApi.js";
import { getAuthToken } from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { openExternalUrl } from "../utils/security.js";

const PAGE_LIMIT = 10;

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
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
        setError(err.message || "Failed to load transactions.");
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
  }, [appliedFilters, page]);

  function applyFilters(event) {
    event.preventDefault();
    setError("");

    if (from && to && new Date(from) > new Date(to)) {
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
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="mb-4">
        <BackButton fallback="/dashboard" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Transaction History
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          View and filter your remittance transactions, both sent and received.
        </p>
      </div>

      <form
        onSubmit={applyFilters}
        className="bg-white border rounded-xl p-4 flex flex-wrap gap-4 items-end"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Status
          </label>
          <select
            className="border rounded-md px-2 py-1 text-sm"
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
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Direction
          </label>
          <select
            className="border rounded-md px-2 py-1 text-sm"
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
          >
            <option value="all">All</option>
            <option value="sent">Sent</option>
            <option value="received">Received</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            From date
          </label>
          <input
            type="date"
            className="border rounded-md px-2 py-1 text-sm"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            To date
          </label>
          <input
            type="date"
            className="border rounded-md px-2 py-1 text-sm"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>

        <div className="ml-auto">
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800"
          >
            Apply
          </button>
        </div>
      </form>

      <div className="rounded-2xl border bg-white p-6">
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

        {loading ? (
          <div className="text-sm text-gray-600">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="text-sm text-gray-600">No transactions found.</div>
        ) : (
          <div className="space-y-2">
            <div className="divide-y">
              {transactions.map((transaction) => {
                const isSent = transaction.direction === "sent";
                const explorerUrl = getExplorerTxUrl(transaction.txHash);

                return (
                  <div
                    key={transaction.id}
                    className="py-3 flex items-start justify-between gap-4 hover:bg-gray-50 cursor-pointer"
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
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {isSent ? "Sent" : "Received"} {transaction.amount} ETH
                        {typeof transaction.fiatAmountUsd === "number" && (
                          <span className="text-xs text-gray-500 ml-1">
                            (~ {transaction.fiatAmountUsd.toFixed(2)}{" "}
                            {transaction.fiatCurrency || "USD"})
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-gray-600 font-mono mt-1">
                        {isSent
                          ? `To: ${transaction.receiverWallet}`
                          : `From: ${transaction.senderWallet}`}
                      </div>

                      {transaction.txHash && (
                        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                          <div className="font-mono">
                            Tx: {transaction.txHash.slice(0, 10)}...
                            {transaction.txHash.slice(-8)}
                          </div>
                          {explorerUrl && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openExternalUrl(explorerUrl);
                              }}
                              className="text-[11px] text-blue-600 hover:underline"
                            >
                              View on BscScan
                            </button>
                          )}
                        </div>
                      )}

                      <div className="text-xs text-gray-500 mt-1">
                        {formatDateTime(transaction.createdAt) || "-"}
                      </div>
                    </div>

                    <span
                      className={`text-xs px-3 py-1 rounded-full ${statusBadgeClasses(
                        transaction.status
                      )}`}
                    >
                      {transaction.status}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-4 text-xs text-gray-600">
              <div>
                Page {page} of {totalPages} - {total} transaction
                {total === 1 ? "" : "s"}
              </div>
              <div className="space-x-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={page === totalPages}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
