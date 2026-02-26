import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer, PageError, PageHeader } from "../components/PageLayout.jsx";
import { apiRequest } from "../services/api.js";
import { requireAuthToken } from "../services/session.js";
import { formatDateOnly, formatDateTime } from "../utils/datetime.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { openExternalUrl } from "../utils/security.js";

import { getUserErrorMessage } from "../utils/userError.js";
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
  const [error, setError] = useState("");
  const [usersError, setUsersError] = useState("");

  const [togglingUserId, setTogglingUserId] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadAdminData() {
      const token = requireAuthToken({
        message: "You must be logged in as an admin to view this page.",
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

      try {
        setLoading(true);
        setError("");

        const [summaryRes, txRes, usersRes] = await Promise.all([
          apiRequest("/api/admin/summary", { token }),
          apiRequest("/api/admin/transactions?limit=10&page=1", { token }),
          apiRequest("/api/admin/users?limit=20&page=1", { token }),
        ]);

        if (isCancelled) return;
        setSummary(summaryRes.summary || null);
        setTransactions(txRes.transactions || []);
        setUsers(usersRes.users || []);
      } catch (err) {
        if (isCancelled) return;
        setError(getUserErrorMessage(err, "Failed to load admin dashboard."));
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadAdminData();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function handleToggleUser(user) {
    const token = requireAuthToken({
      message: "You must be logged in as an admin.",
      onMissing: (message) => setUsersError(message),
    });
    if (!token) {
      return;
    }

    const nextDisabledState = !user.isDisabled;
    const action = nextDisabledState ? "disable" : "enable";
    const confirmed = window.confirm(
      `Are you sure you want to ${action} this user?\n\n${user.username || user.email}`
    );
    if (!confirmed) return;

    try {
      setTogglingUserId(user.id);
      setUsersError("");

      const result = await apiRequest(`/api/admin/users/${user.id}/disable`, {
        method: "PATCH",
        token,
        body: { isDisabled: nextDisabledState },
      });

      const updatedUser = result.user;
      setUsers((prev) =>
        prev.map((entry) => (entry.id === updatedUser.id ? updatedUser : entry))
      );

      setSummary((prev) => {
        if (!prev) return prev;

        const activeDelta = nextDisabledState ? -1 : 1;
        const disabledDelta = nextDisabledState ? 1 : -1;

        return {
          ...prev,
          users: {
            ...prev.users,
            active: (prev.users?.active || 0) + activeDelta,
            disabled: (prev.users?.disabled || 0) + disabledDelta,
          },
        };
      });
    } catch (err) {
      setUsersError(getUserErrorMessage(err, "Failed to update user status."));
    } finally {
      setTogglingUserId(null);
    }
  }

  return (
    <PageContainer stack className="gap-8">
      <PageHeader
        title="Admin Dashboard"
        description="System-level overview of users, transactions, and security events."
        actions={
          <Link
            to="/admin/audit-logs"
            className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            View audit logs
          </Link>
        }
      />

      <PageError>{error}</PageError>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Overview</h2>

        {loading && !summary && (
          <div className="text-xs text-gray-500">Loading summary...</div>
        )}

        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total users"
              value={summary.users?.total ?? 0}
              sub={`Active: ${summary.users?.active ?? 0} - Disabled: ${
                summary.users?.disabled ?? 0
              }`}
            />
            <StatCard label="Admins" value={summary.admins?.total ?? 0} />
            <StatCard label="Wallets" value={summary.wallets?.total ?? 0} />
            <StatCard
              label="Transactions"
              value={summary.transactions?.total ?? 0}
              sub={`Success: ${summary.transactions?.byStatus?.success ?? 0} - Pending: ${
                summary.transactions?.byStatus?.pending ?? 0
              } - Failed: ${summary.transactions?.byStatus?.failed ?? 0}`}
            />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">User management</h2>
          <p className="text-xs text-gray-500">
            Disable an account to immediately block access.
          </p>
        </div>

        {usersError && <div className="text-xs text-red-600">{usersError}</div>}

        {loading && users.length === 0 ? (
          <div className="text-xs text-gray-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-xs text-gray-500">No users found yet.</div>
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
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-gray-100 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-2 text-xs font-mono">{user.email}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">
                      {user.username || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          userStatusBadgeClasses(user.isDisabled)
                        }
                      >
                        {user.isDisabled ? "Disabled" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {formatDateOnly(user.createdAt) || "-"}
                    </td>
                    <td className="px-4 py-2 text-xs text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleUser(user)}
                        disabled={togglingUserId === user.id}
                        className={
                          "inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium " +
                          (user.isDisabled
                            ? "border border-green-600 text-green-700 hover:bg-green-50"
                            : "border border-red-600 text-red-700 hover:bg-red-50")
                        }
                      >
                        {togglingUserId === user.id
                          ? "Updating..."
                          : user.isDisabled
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

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            Recent transactions
          </h2>
          <p className="text-xs text-gray-500">
            Use this view to quickly spot failures or suspicious activity.
          </p>
        </div>

        {loading && transactions.length === 0 ? (
          <div className="text-xs text-gray-500">Loading transactions...</div>
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
                {transactions.map((transaction) => {
                  const explorerUrl = getExplorerTxUrl(transaction.txHash);

                  return (
                    <tr
                      key={transaction.id}
                      className="border-t border-gray-100 hover:bg-gray-50/60"
                    >
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {formatDateTime(transaction.createdAt) || "-"}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px]">
                            {transaction.senderWallet || "-"}
                          </span>
                          {transaction.senderEmail && (
                            <span className="text-[11px] text-gray-500">
                              {transaction.senderEmail}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px]">
                            {transaction.receiverWallet || "-"}
                          </span>
                          {transaction.receiverEmail && (
                            <span className="text-[11px] text-gray-500">
                              {transaction.receiverEmail}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs font-mono">
                        {typeof transaction.amount === "number"
                          ? transaction.amount.toFixed(4)
                          : transaction.amount}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span
                          className={
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                            statusBadgeClasses(transaction.status)
                          }
                        >
                          {transaction.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs font-mono">
                        {transaction.txHash ? (
                          <div className="space-y-0.5">
                            <div>{transaction.txHash.slice(0, 12)}...</div>
                            {explorerUrl && (
                              <button
                                type="button"
                                className="text-[10px] text-blue-600 hover:underline"
                                onClick={() => openExternalUrl(explorerUrl)}
                              >
                                View on BscScan
                              </button>
                            )}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageContainer>
  );
}
