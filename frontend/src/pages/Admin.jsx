import { useEffect, useState } from "react";
import { apiRequest } from "../services/api.js";

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-800";
}

export default function Admin() {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("You must be logged in as an admin to view this page.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const [summaryRes, txRes] = await Promise.all([
        apiRequest("/api/admin/summary", { token }),
        apiRequest("/api/admin/transactions?limit=20", { token }),
      ]);

      setSummary(summaryRes.summary || null);
      setTransactions(txRes.transactions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-600 mt-1">
          System-level overview of users and remittance activity.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-100 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && !error ? (
        <div className="text-sm text-gray-600">Loading admin data…</div>
      ) : null}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Users"
            value={summary.users.total}
            sub={`${summary.users.active} active, ${summary.users.disabled} disabled`}
          />
          <StatCard
            label="Admin Accounts"
            value={summary.admins.total}
          />
          <StatCard
            label="Wallets"
            value={summary.wallets.total}
          />
          <StatCard
            label="Transactions"
            value={summary.transactions.total}
            sub={
              `Success: ${summary.transactions.byStatus.success}, ` +
              `Pending: ${summary.transactions.byStatus.pending}, ` +
              `Failed: ${summary.transactions.byStatus.failed}`
            }
          />
        </div>
      )}

      {/* Latest transactions */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Latest Transactions
          </h2>
          <span className="text-xs text-gray-500">
            Showing most recent {transactions.length} records
          </span>
        </div>

        {transactions.length === 0 ? (
          <p className="text-sm text-gray-600">No transactions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Sender</th>
                  <th className="px-3 py-2">Receiver</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Tx Hash</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-gray-700">
                      {new Date(t.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      <div className="flex flex-col">
                        {t.senderEmail && (
                          <span className="font-medium">{t.senderEmail}</span>
                        )}
                        <span className="font-mono text-[11px] text-gray-500">
                          {t.senderWallet}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      <div className="flex flex-col">
                        {t.receiverEmail && (
                          <span className="font-medium">{t.receiverEmail}</span>
                        )}
                        <span className="font-mono text-[11px] text-gray-500">
                          {t.receiverWallet}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {t.amount} ETH
                    </td>
                    <td className="px-3 py-2 text-gray-700 font-mono text-[11px]">
                      {t.txHash
                        ? `${t.txHash.slice(0, 10)}...${t.txHash.slice(-8)}`
                        : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full ${statusBadgeClasses(
                          t.status
                        )}`}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
