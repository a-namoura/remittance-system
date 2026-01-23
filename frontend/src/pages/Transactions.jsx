import { useEffect, useState } from "react";
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const limit = 10;

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
      });

      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]); // filters are applied via the "Apply filters" button

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function applyFilters(e) {
    e.preventDefault();
    setPage(1);
    load();
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
        <h1 className="text-2xl font-bold text-gray-900">Transaction History</h1>
        <p className="text-sm text-gray-600 mt-1">
          View and filter your remittance transactions.
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
            <option value="pending">Pending</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            From
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
            To
          </label>
          <input
            type="date"
            className="border rounded-md px-2 py-1 text-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="
            px-4 py-2 rounded-md text-sm font-semibold
            bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition
          "
        >
          Apply filters
        </button>
      </form>

      {/* List */}
      <div className="bg-white border rounded-xl p-4">
        {error && (
          <div className="mb-3 p-3 rounded bg-red-100 text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-600">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="text-sm text-gray-600">No transactions found.</div>
        ) : (
          <div className="divide-y">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="py-3 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    Sent {t.amount} ETH
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
                      Tx: {t.txHash.slice(0, 10)}...{t.txHash.slice(-8)}
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
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
            <div>
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
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
        )}
      </div>
    </div>
  );
}
