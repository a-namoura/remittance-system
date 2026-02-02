import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  if (status === "pending") return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-700";
}

function userStatusBadgeClasses(isDisabled) {
  return isDisabled
    ? "bg-red-100 text-red-700"
    : "bg-green-100 text-green-700";
}

export default function Admin() {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [transactionsError, setTransactionsError] = useState("");
  const [usersError, setUsersError] = useState("");
  const [globalError, setGlobalError] = useState("");

  const [togglingUserId, setTogglingUserId] = useState(null);

  async function load() {
    const token = localStorage.getItem("token");
    if (!token) {
      setGlobalError("You must be logged in as an admin to view this page.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setGlobalError("");
      setSummaryError("");
      setTransactionsError("");
      setUsersError("");

      const [summaryRes, txRes, usersRes] = await Promise.all([
        apiRequest("/api/admin/summary", { token }),
        apiRequest("/api/admin/transactions?limit=10&page=1", { token }),
        apiRequest("/api/admin/users?limit=20&page=1", { token }),
      ]);

      setSummary(summaryRes.summary || null);
      setTransactions(txRes.transactions || []);
      setUsers(usersRes.users || []);
    } catch (err) {
      console.error("Admin load failed:", err);
      setGlobalError(err.message || "Failed to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggleUser(user) {
    const token = localStorage.getItem("token");
    if (!token) {
      setUsersError("You must be logged in as an admin.");
      return;
    }

    const newDisabled = !user.isDisabled;
    const verb = newDisabled ? "disable" : "enable";

    const confirmed = window.confirm(
      `Are you sure you want to ${verb} this user?\n\n${user.email}`
    );
    if (!confirmed) return;

    try {
      setTogglingUserId(user.id);
      setUsersError("");

      const res = await apiRequest(
        `/api/admin/users/${user.id}/disable`,
        {
          method: "PATCH",
          token,
          body: { isDisabled: newDisabled },
        }
      );

      const updatedUser = res.user;
      setUsers((prev) =>
        prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
      );

      // Optional: keep summary counts in sync
      if (summary) {
        setSummary((prev) => {
          if (!prev) return prev;
          const deltaActive = newDisabled ? -1 : 1;
          const deltaDisabled = newDisabled ? 1 : -1;

          return {
            ...prev,
            users: {
              ...prev.users,
              active: (prev.users.active || 0) + deltaActive,
              disabled: (prev.users.disabled || 0) + deltaDisabled,
            },
          };
        });
      }
    } catch (err) {
      console.error("Failed to toggle user", err);
      setUsersError(err.message || "Failed to update user status.");
    } finally {
      setTogglingUserId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">
            System-level overview of users, transactions, and security events.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/admin/audit-logs"
            className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            View audit logs
          </Link>
        </div>
      </div>

      {globalError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {globalError}
        </div>
      )}

      {/* Summary stats */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Overview</h2>
        {summaryError && (
          <div className="text-xs text-red-600">{summaryError}</div>
        )}

        {loading && !summary && (
          <div className="text-xs text-gray-500">Loading summary…</div>
        )}

        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total users"
              value={summary.users?.total ?? 0}
              sub={`Active: ${summary.users?.active ?? 0} • Disabled: ${
                summary.users?.disabled ?? 0
              }`}
            />
            <StatCard
              label="Admins"
              value={summary.admins?.total ?? 0}
            />
            <StatCard
              label="Wallets"
              value={summary.wallets?.total ?? 0}
            />
            <StatCard
              label="Transactions"
              value={summary.transactions?.total ?? 0}
              sub={`Success: ${
                summary.transactions?.byStatus?.success ?? 0
              } • Pending: ${
                summary.transactions?.byStatus?.pending ?? 0
              } • Failed: ${
                summary.transactions?.byStatus?.failed ?? 0
              }`}
            />
          </div>
        )}
      </section>

      {/* User management */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            User management
          </h2>
          <p className="text-xs text-gray-500">
            Disable an account to immediately block access to the system.
          </p>
        </div>

        {usersError && (
          <div className="text-xs text-red-600">{usersError}</div>
        )}

        {loading && users.length === 0 ? (
          <div className="text-xs text-gray-500">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="text-xs text-gray-500">
            No users found yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Username</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Created</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-gray-100 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-2 text-xs font-mono">
                      {u.email}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700">
                      {u.username || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          userStatusBadgeClasses(u.isDisabled)
                        }
                      >
                        {u.isDisabled ? "Disabled" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {u.createdAt
                        ? new Date(u.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleUser(u)}
                        disabled={togglingUserId === u.id}
                        className={
                          "inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium " +
                          (u.isDisabled
                            ? "border border-green-600 text-green-700 hover:bg-green-50"
                            : "border border-red-600 text-red-700 hover:bg-red-50")
                        }
                      >
                        {togglingUserId === u.id
                          ? "Updating…"
                          : u.isDisabled
                          ? "Enable"
                          : "Disable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent transactions */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            Recent transactions
          </h2>
          <p className="text-xs text-gray-500">
            Use this view to quickly spot failures or suspicious activity.
          </p>
        </div>

        {transactionsError && (
          <div className="text-xs text-red-600">{transactionsError}</div>
        )}

        {loading && transactions.length === 0 ? (
          <div className="text-xs text-gray-500">Loading transactions…</div>
        ) : transactions.length === 0 ? (
          <div className="text-xs text-gray-500">
            No transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Sender</th>
                  <th className="px-4 py-2 text-left">Receiver</th>
                  <th className="px-4 py-2 text-left">Amount (ETH)</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Tx hash</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t border-gray-100 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-2 text-xs text-gray-600">
                      {t.createdAt
                        ? new Date(t.createdAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <div className="flex flex-col">
                        <span className="font-mono text-[11px]">
                          {t.senderWallet || "—"}
                        </span>
                        {t.senderEmail && (
                          <span className="text-[11px] text-gray-500">
                            {t.senderEmail}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <div className="flex flex-col">
                        <span className="font-mono text-[11px]">
                          {t.receiverWallet || "—"}
                        </span>
                        {t.receiverEmail && (
                          <span className="text-[11px] text-gray-500">
                            {t.receiverEmail}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono">
                      {typeof t.amount === "number"
                        ? t.amount.toFixed(4)
                        : t.amount}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          statusBadgeClasses(t.status)
                        }
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono">
                      {t.txHash ? t.txHash.slice(0, 12) + "…" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
