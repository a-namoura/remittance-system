import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyTransactions } from "../services/transactionApi.js";
import BackButton from "../components/BackButton.jsx";

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all"); // all | sent | received
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setError("You are not logged in.");
          return;
        }

        setLoading(true);
        setError("");

        const data = await getMyTransactions({
          token,
          limit,
          page,
          status: status === "all" ? undefined : status,
          from: from || undefined,
          to: to || undefined,
          view: direction === "all" ? undefined : direction,
        });

        setTransactions(data.transactions || []);
        setTotal(data.total || 0);
      } catch (err) {
        setError(err.message || "Failed to load transactions.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [status, direction, from, to, page, limit]);

  function applyFilters(e) {
    e.preventDefault();
    setPage(1);
  }

  function handlePrev() {
    setPage((p) => Math.max(1, p - 1));
  }

  function handleNext() {
    setPage((p) => Math.min(totalPages, p + 1));
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

      {/* Filters */}
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
            onChange={(e) => setStatus(e.target.value)}
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
            onChange={(e) => setDirection(e.target.value)}
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
            onChange={(e) => setFrom(e.target.value)}
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
            onChange={(e) => setTo(e.target.value)}
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

      {/* List */}
      <div className="rounded-2xl border bg-white p-6">
        {error && (
          <div className="mb-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-600">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="text-sm text-gray-600">No transactions found.</div>
        ) : (
          <div className="space-y-2">
            <div className="divide-y">
              {transactions.map((t) => {
                const isSent = t.direction === "sent";

                return (
                  <div
                    key={t.id}
                    className="py-3 flex items-start justify-between gap-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/transactions/${t.id}`)}
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {isSent ? "Sent" : "Received"} {t.amount} ETH
                        {typeof t.fiatAmountUsd === "number" && (
                          <span className="text-xs text-gray-500 ml-1">
                            (~ {t.fiatAmountUsd.toFixed(2)}{" "}
                            {t.fiatCurrency || "USD"})
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-gray-600 font-mono mt-1">
                        {isSent
                          ? `To: ${t.receiverWallet}`
                          : `From: ${t.senderWallet}`}
                      </div>

                      {t.txHash && (
                        <div className="text-xs text-gray-500 font-mono mt-1">
                          Tx: {t.txHash.slice(0, 10)}...
                          {t.txHash.slice(-8)}
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
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 text-xs text-gray-600">
              <div>
                Page {page} of {totalPages} — {total} transaction
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
