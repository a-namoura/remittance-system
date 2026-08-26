import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PageContainer, PageError, PageHeader, PageLoading } from "../components/PageLayout.jsx";
import { apiRequest } from "../services/api.js";
import { requireAuthToken } from "../services/session.js";
import { formatDateOnly, formatDateTime } from "../utils/datetime.js";
import { getExplorerTxUrl } from "../utils/explorer.js";
import { openExternalUrl } from "../utils/security.js";
import CopyableWalletAddress from "../components/CopyableWalletAddress.jsx";
import BackButton from "../components/BackButton.jsx";
import { downloadTransactionReceipt } from "../utils/transactionReceipt.js";
import { confirmInSystem, promptInSystem } from "../services/inSystemDialogs.js";

import { getUserErrorMessage } from "../utils/userError.js";
function StatCard({ label, value, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border bg-white p-4 text-left transition hover:border-purple-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      <div className="mt-3 text-[11px] font-medium text-purple-700">View details →</div>
    </button>
  );
}

function statusBadgeClasses(status) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "cancelled") return "bg-gray-100 text-gray-700";
  if (status === "reversed") return "bg-orange-100 text-orange-800";
  if (status === "pending") return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-700";
}

function userStatusBadgeClasses(isDisabled) {
  return isDisabled
    ? "bg-red-100 text-red-700"
    : "bg-green-100 text-green-700";
}

function userLabel(user) {
  if (!user) return "Unknown account";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return name || (user.username ? `@${user.username}` : user.email || "Unknown account");
}

function DetailItem({ label, children, mono = false }) {
  return <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt><dd className={`mt-1 break-words text-xs text-gray-900 ${mono ? "font-mono" : ""}`}>{children ?? "-"}</dd></div>;
}

function AdminModal({ title, description, onClose, children }) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900">{title}</h2>{description && <p className="mt-1 text-sm text-gray-500">{description}</p>}</div><button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-gray-50">← Back</button></div><div className="mt-5">{children}</div></section></div>;
}

export default function Admin({ section = "overview" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]);
  const [chatReports, setChatReports] = useState([]);
  const [suspiciousActivity, setSuspiciousActivity] = useState([]);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [transactionStatus, setTransactionStatus] = useState("all");
  const [transactionSearch, setTransactionSearch] = useState(() => location.state?.userFilter || "");
  const [transactionPage, setTransactionPage] = useState(1);
  const [expandedTransactionId, setExpandedTransactionId] = useState(null);
  const [overviewModal, setOverviewModal] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usersError, setUsersError] = useState("");
  const [transactionActionError, setTransactionActionError] = useState("");
  const [cancellingTransactionId, setCancellingTransactionId] = useState(null);
  const [reversingTransactionId, setReversingTransactionId] = useState(null);

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

        const [summaryRes, txRes, usersRes, chatReportsRes, suspiciousRes] = await Promise.all([
          apiRequest("/api/admin/summary", { token }),
          apiRequest("/api/admin/transactions?limit=500&page=1", { token }),
          apiRequest("/api/admin/users?limit=100&page=1", { token }),
          apiRequest("/api/admin/chat-reports?limit=100", { token }),
          apiRequest("/api/admin/suspicious-activity?limit=100", { token }),
        ]);

        if (isCancelled) return;
        setSummary(summaryRes.summary || null);
        setTransactions(txRes.transactions || []);
        setTransactionTotal(txRes.total || 0);
        setUsers(usersRes.users || []);
        setChatReports(chatReportsRes.reports || []);
        setSuspiciousActivity(suspiciousRes.items || []);
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

  const filteredTransactions = useMemo(() => {
    const search = transactionSearch.trim().toLowerCase();
    return transactions.filter((transaction) => {
      if (transactionStatus !== "all" && transaction.status !== transactionStatus) return false;
      if (!search) return true;
      return [transaction.id, transaction.senderUsername, transaction.receiverUsername, transaction.senderEmail, transaction.receiverEmail,
        transaction.senderWallet, transaction.receiverWallet, transaction.txHash,
        transaction.assetSymbol, transaction.failureReason]
        .some((value) => String(value || "").toLowerCase().includes(search));
    });
  }, [transactions, transactionSearch, transactionStatus]);
  const selectedUser = users.find((user) => String(user.id) === String(selectedUserId)) || null;
  const suspiciousByTransactionId = useMemo(() => new Map(suspiciousActivity.map((item) => [String(item.transactionId), item])), [suspiciousActivity]);
  const transactionPageCount = Math.max(1, Math.ceil(filteredTransactions.length / 10));
  const pagedTransactions = filteredTransactions.slice((transactionPage - 1) * 10, transactionPage * 10);

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
    const confirmed = await confirmInSystem({ title: `${action === "disable" ? "Disable" : "Enable"} account?`, message: `Are you sure you want to ${action} ${user.username || user.email}?`, confirmLabel: action === "disable" ? "Disable account" : "Enable account", danger: action === "disable" });
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

  async function handleCancelTransaction(transaction) {
    if (!transaction?.canCancel) return;
    const confirmed = await confirmInSystem({ title: "Cancel pending transaction?", message: "This is allowed only before blockchain submission. It does not refund a confirmed blockchain transfer.", confirmLabel: "Cancel transaction", danger: true });
    if (!confirmed) return;
    const token = requireAuthToken({ message: "You must be logged in as an admin.", onMissing: setTransactionActionError });
    if (!token) return;
    try {
      setCancellingTransactionId(transaction.id);
      setTransactionActionError("");
      const result = await apiRequest(`/api/admin/transactions/${transaction.id}/cancel`, { method: "PATCH", token });
      setTransactions((current) => current.map((item) => item.id === transaction.id ? { ...item, ...result.transaction, canCancel: false } : item));
      setSummary((current) => current ? { ...current, transactions: { ...current.transactions, byStatus: { ...current.transactions.byStatus, pending: Math.max(0, (current.transactions.byStatus?.pending || 0) - 1), cancelled: (current.transactions.byStatus?.cancelled || 0) + 1 } } } : current);
    } catch (err) {
      setTransactionActionError(getUserErrorMessage(err, "Failed to cancel transaction."));
    } finally {
      setCancellingTransactionId(null);
    }
  }

  async function handleReverseTransaction(transaction) {
    if (!transaction?.canReverse) return;
    const reason = await promptInSystem({ title: "Refund transaction", message: "Enter the reason shown to the sender and receiver.", defaultValue: "Refunded by an administrator.", confirmLabel: "Review refund", danger: true });
    if (reason == null || !reason.trim()) return;
    const confirmed = await confirmInSystem({ title: "Confirm on-chain refund", message: "Return the original amount from the receiver's custodial wallet to the sender, then notify both parties? This creates a new blockchain transaction and cannot be undone.", confirmLabel: "Refund funds", danger: true });
    if (!confirmed) return;
    const token = requireAuthToken({ message: "You must be logged in as an admin.", onMissing: setTransactionActionError });
    if (!token) return;
    try {
      setReversingTransactionId(transaction.id);
      setTransactionActionError("");
      const result = await apiRequest(`/api/admin/transactions/${transaction.id}/reverse`, { method: "PATCH", token, body: { reason: reason.trim() } });
      setTransactions((current) => current.map((item) => item.id === transaction.id ? { ...item, ...result.transaction, canReverse: false } : item));
      setSummary((current) => current ? { ...current, transactions: { ...current.transactions, byStatus: { ...current.transactions.byStatus, success: Math.max(0, (current.transactions.byStatus?.success || 0) - 1), reversed: (current.transactions.byStatus?.reversed || 0) + 1 } } } : current);
    } catch (err) {
      setTransactionActionError(getUserErrorMessage(err, "Failed to refund transaction."));
    } finally {
      setReversingTransactionId(null);
    }
  }

  return (
    <PageContainer stack className="gap-8">
      {section !== "overview" && <div><BackButton fallback="/admin" label="Back" /></div>}
      <PageHeader
        title={{ overview: "Admin Dashboard", analytics: "Admin Analytics", users: "User Management", wallets: "Wallet Management", reports: "Reported Conversations", transactions: "Transactions" }[section] || "Admin Dashboard"}
        description={{ overview: "Choose an administration area to review and manage.", analytics: "System-wide operational and transaction performance.", users: "Review accounts, activity, verification, and access.", wallets: "Review linked wallets, verification, balances, and sync health.", reports: "Review conversations disclosed by participants.", transactions: "Review transaction records and pending actions." }[section]}
        actions={
          <div className="flex gap-2">{section !== "transactions" && <Link to="/admin/transactions" className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Transactions</Link>}<Link to="/admin/audit-logs" className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Audit logs</Link></div>
        }
      />

      <PageError>{error}</PageError>

      {section === "reports" && <section id="reports" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Reported conversations</h2>
          <p className="mt-1 text-xs text-gray-500">
            Only messages deliberately disclosed by a participant while reporting are visible.
          </p>
        </div>
        {chatReports.length === 0 ? (
          <div className="text-xs text-gray-500">No conversations have been reported.</div>
        ) : (
          <div className="space-y-3">
            {chatReports.map((report, reportIndex) => (
              <details
                key={`${report.threadId}-${report.createdAt}-${reportIndex}`}
                className="group rounded-2xl border bg-white p-4 open:border-purple-300"
              >
                <summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{report.reason}</p>
                  <div className="flex items-center gap-3"><time className="text-xs text-gray-500">{formatDateTime(report.createdAt)}</time><span className="text-xs font-medium text-purple-700">Expand details</span></div>
                </div></summary>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600"><span>Reporter: <strong className="text-gray-900">{userLabel(report.reporter)}</strong>{report.reporter?.email ? ` (${report.reporter.email})` : ""}</span><span>·</span><span>Reported account: <strong className="text-gray-900">{userLabel(report.reportedAccount)}</strong>{report.reportedAccount?.email ? ` (${report.reportedAccount.email})` : ""}</span></div>
                <div className="mt-3 flex flex-wrap gap-2">{report.reporter && <button type="button" onClick={() => setSelectedUserId(String(report.reportedByUserId))} className="rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50">Review reporter</button>}{report.reportedAccount && <button type="button" onClick={() => setSelectedUserId(String(report.targetUserId))} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Review reported account</button>}</div>
                <div className="mt-3 space-y-2">
                  {(report.revealedMessages || []).length === 0 ? (
                    <p className="text-xs text-gray-500">No message content was disclosed.</p>
                  ) : (
                    report.revealedMessages.map((message) => (
                      <pre
                        key={message.messageId}
                        className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-2 text-xs text-gray-700"
                      >
                        {message.plaintext}
                      </pre>
                    ))
                  )}
                </div>
                <div className="mt-3 break-all rounded-lg bg-gray-50 p-2 text-xs text-gray-600">Thread: <span className="font-mono">{report.threadId}</span></div>
              </details>
            ))}
          </div>
        )}
      </section>}

      {section === "overview" && <section id="overview" className="scroll-mt-24 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Overview</h2>

        {loading && !summary && users.length === 0 && transactions.length === 0 && (
          <PageLoading>Loading administration data</PageLoading>
        )}

        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total users"
              value={summary.users?.total ?? 0}
              sub={`Active: ${summary.users?.active ?? 0} - Disabled: ${
                summary.users?.disabled ?? 0
              }`}
              onClick={() => navigate("/admin/users")}
            />
            <StatCard label="Admins" value={summary.admins?.total ?? 0} sub="View administrator accounts" onClick={() => navigate("/admin/users")} />
            <StatCard label="Wallets" value={summary.wallets?.total ?? 0} sub="View wallet coverage" onClick={() => navigate("/admin/wallets")} />
            <StatCard
              label="Transactions"
              value={summary.transactions?.total ?? 0}
              sub={`Success: ${summary.transactions?.byStatus?.success ?? 0} - Pending: ${
                summary.transactions?.byStatus?.pending ?? 0
              } - Failed: ${summary.transactions?.byStatus?.failed ?? 0}`}
              onClick={() => navigate("/admin/transactions")}
            />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ["Analytics", "Performance, volume, fees, and growth", "/admin/analytics"],
          ["Reports", `${chatReports.length} reported conversation${chatReports.length === 1 ? "" : "s"}`, "/admin/reports"],
          ["Audit logs", "Search system and administrator actions", "/admin/audit-logs"],
        ].map(([label, description, to]) => <Link key={to} to={to} className="rounded-xl border bg-white p-4 transition hover:border-purple-300 hover:shadow-sm"><div className="text-sm font-semibold text-gray-900">{label}</div><div className="mt-1 text-xs text-gray-500">{description}</div><div className="mt-3 text-xs font-medium text-purple-700">Open →</div></Link>)}</div>
      </section>}

      {section === "analytics" && summary && <section id="analytics" className="scroll-mt-24 space-y-4">
        <div><h2 className="text-sm font-semibold text-gray-800">Analytics</h2><p className="mt-1 text-xs text-gray-500">System-wide operational and transaction performance.</p></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Success rate", `${summary.transactions?.total ? ((summary.transactions.byStatus?.success || 0) / summary.transactions.total * 100).toFixed(1) : "0.0"}%`, "Completed transfers", "/admin/transactions"],
            ["Failure rate", `${summary.transactions?.total ? ((summary.transactions.byStatus?.failed || 0) / summary.transactions.total * 100).toFixed(1) : "0.0"}%`, "Failed transfers", "/admin/transactions"],
            ["Total volume", Number(summary.transactions?.totalVolume || 0).toFixed(4), "All recorded assets", "/admin/transactions"],
            ["Average transfer", Number(summary.transactions?.averageAmount || 0).toFixed(4), "Mean amount", "/admin/transactions"],
            ["Last 24 hours", summary.transactions?.last24Hours ?? 0, "New transactions", "/admin/transactions"],
            ["New users (30d)", summary.activity?.usersCreatedLast30Days ?? 0, "Registrations", "/admin/users"],
            ["Service fees", Number(summary.transactions?.totalServiceFees || 0).toFixed(4), "Recorded total", "/admin/transactions"],
            ["Wallet coverage", `${summary.users?.total ? Math.round((summary.wallets?.total || 0) / summary.users.total * 100) : 0}%`, "Wallets per user", "/admin/wallets"],
          ].map(([label, value, caption, to]) => <Link to={to} key={label} className="rounded-xl border bg-white p-4 transition hover:border-purple-300"><div className="text-xs text-gray-500">{label}</div><div className="mt-1 text-xl font-semibold text-gray-900">{value}</div><div className="mt-1 text-[11px] text-gray-500">{caption}</div><div className="mt-2 text-[11px] font-medium text-purple-700">Review →</div></Link>)}
        </div>
      </section>}

      {section === "wallets" && <section className="space-y-4"><div className="flex items-center justify-between"><p className="text-xs text-gray-500">{users.filter((user) => user.wallet).length} linked wallets</p><Link to="/admin/transactions" className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-white">Review wallet activity</Link></div><div className="grid gap-3 lg:grid-cols-2">{users.map((user) => <article key={user.id} className="rounded-xl border bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold">{userLabel(user)}</div><div className="text-xs text-gray-500">@{user.username}</div></div><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${user.wallet?.isVerified ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{user.wallet ? (user.wallet.isVerified ? "Verified" : "Unverified") : "Not linked"}</span></div>{user.wallet ? <dl className="mt-4 grid grid-cols-2 gap-3"><DetailItem label="Address" mono>{user.wallet.address}</DetailItem><DetailItem label="Type">{user.wallet.type}</DetailItem><DetailItem label="Balance">{user.wallet.nativeBalance ?? "-"} {user.wallet.nativeBalanceSymbol || ""}</DetailItem><DetailItem label="Last synced">{formatDateTime(user.wallet.nativeBalanceUpdatedAt) || "-"}</DetailItem></dl> : <p className="mt-4 text-xs text-gray-500">This account has no wallet.</p>}<div className="mt-4 flex gap-2"><button type="button" onClick={() => setSelectedUserId(String(user.id))} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-gray-50">User details</button><button type="button" onClick={() => navigate("/admin/transactions", { state: { userFilter: user.username } })} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-gray-50">Transactions</button></div></article>)}</div></section>}

      {section === "users" && <section id="users" className="scroll-mt-24 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">User management</h2>
          <p className="text-xs text-gray-500">
            Disable an account to immediately block access.
          </p>
        </div>

        {usersError && <div className="text-xs text-red-600">{usersError}</div>}

        {loading && users.length === 0 ? null : users.length === 0 ? (
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
                  <Fragment key={user.id}>
                  <tr
                    className="border-t border-gray-100 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-2 text-xs font-mono"><button type="button" className="text-left hover:text-purple-700 hover:underline" onClick={() => setSelectedUserId(String(user.id))}>{user.email}</button></td>
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
                      <div className="flex justify-end gap-2"><button type="button" onClick={() => setSelectedUserId(String(user.id))} className="inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-gray-50">Details</button><button type="button" onClick={() => navigate("/admin/transactions", { state: { userFilter: user.username } })} className="inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-gray-50">Activity</button>
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
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {section === "transactions" && <section id="transactions" className="scroll-mt-24 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            All transactions
          </h2>
          <p className="text-xs text-gray-500">Showing {filteredTransactions.length} of {transactionTotal} records · 10 per page. Select a row for details.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={transactionSearch} onChange={(event) => { setTransactionSearch(event.target.value); setTransactionPage(1); }} placeholder="Search username, wallet, hash, ID, asset or error" className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-purple-500" />
          <select value={transactionStatus} onChange={(event) => { setTransactionStatus(event.target.value); setTransactionPage(1); }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-purple-500"><option value="all">All statuses</option><option value="success">Success</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="reversed">Refunded</option></select>
        </div>
        <PageError>{transactionActionError}</PageError>

        {loading && transactions.length === 0 ? null : transactions.length === 0 ? (
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
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Risk</th>
                  <th className="px-4 py-2 text-left">Tx hash</th>
                </tr>
              </thead>
              <tbody>
                {pagedTransactions.map((transaction) => {
                  const explorerUrl = getExplorerTxUrl(transaction.txHash);
                  const risk = suspiciousByTransactionId.get(String(transaction.id));

                  return (<Fragment key={transaction.id}>
                    <tr
                      className="cursor-pointer border-t border-gray-100 hover:bg-gray-50/60"
                      onClick={() => setExpandedTransactionId(expandedTransactionId === transaction.id ? null : transaction.id)}
                    >
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {formatDateTime(transaction.createdAt) || "-"}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px]">
                            {transaction.senderWallet || "-"}
                          </span>
                          {transaction.senderUsername && <span className="text-[11px] font-medium text-gray-700">@{transaction.senderUsername}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">{risk ? <span title={risk.reasons.join("; ")} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${risk.severity === "high" ? "bg-red-100 text-red-700" : risk.severity === "medium" ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-800"}`}><span aria-hidden="true">⚑</span>{risk.severity} · {risk.score}</span> : <span className="text-[11px] text-gray-400">No flags</span>}</td>
                      <td className="px-4 py-2 text-xs">
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px]">
                            {transaction.receiverWallet || "-"}
                          </span>
                          {transaction.receiverUsername && <span className="text-[11px] font-medium text-gray-700">@{transaction.receiverUsername}</span>}
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
                          {transaction.status === "reversed" ? "refunded" : transaction.status}
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
                                onClick={(event) => { event.stopPropagation(); openExternalUrl(explorerUrl); }}
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
                    {expandedTransactionId === transaction.id && <tr className="border-t border-purple-100 bg-purple-50/40"><td colSpan={7} className="p-5">
                      <button type="button" onClick={() => setExpandedTransactionId(null)} className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-purple-700 hover:underline">← Back to transactions</button>
                      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Amount</div><div className="mt-1 text-2xl font-semibold text-gray-900">{transaction.amount} {transaction.assetSymbol || ""}</div>{transaction.recipientAmount != null && <div className="mt-1 text-xs text-gray-500">Recipient receives {transaction.recipientAmount} {transaction.destinationCurrency || transaction.assetSymbol}</div>}</div><div className="flex flex-wrap gap-2">{risk && <span className="rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-red-700">⚑ {risk.severity} risk · {risk.score}/100</span>}{transaction.canCancel && <button type="button" disabled={cancellingTransactionId === transaction.id} onClick={() => handleCancelTransaction(transaction)} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">{cancellingTransactionId === transaction.id ? "Cancelling..." : "Cancel pending transaction"}</button>}{transaction.canReverse && <button type="button" disabled={reversingTransactionId === transaction.id} onClick={() => handleReverseTransaction(transaction)} className="rounded-lg border border-orange-300 px-3 py-2 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50">{reversingTransactionId === transaction.id ? "Refunding..." : "Refund transaction"}</button>}{explorerUrl && <button type="button" onClick={() => openExternalUrl(explorerUrl)} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-white">View on BscScan</button>}{transaction.status === "success" && <button type="button" onClick={() => downloadTransactionReceipt(transaction)} className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700">Download receipt</button>}</div></div>
                      {risk && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><strong>Suspicious activity signals</strong><ul className="mt-1 space-y-1">{risk.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></div>}
                      {(transaction.failureReason || transaction.reconciliationError) && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><strong>Attention required</strong><div className="mt-1">{transaction.failureReason || transaction.reconciliationError}</div></div>}
                      {transaction.reversalReason && <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800"><strong>Refund reason</strong><div className="mt-1">{transaction.reversalReason}</div></div>}
                      {transaction.reversalTxHash && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800"><strong>Funds returned on-chain</strong><div className="mt-1 break-all font-mono">{transaction.reversalTxHash}</div></div>}
                      <div className="mt-5 grid gap-4 md:grid-cols-2"><div className="rounded-xl border bg-white p-4"><div className="text-xs font-semibold text-gray-900">Sender</div><div className="mt-2 text-xs">{transaction.senderUsername ? `@${transaction.senderUsername}` : "Unlinked account"}</div><CopyableWalletAddress address={transaction.senderWallet} label="" className="mt-1 p-0 text-[11px] text-gray-500" />{transaction.onChainSenderWallet && transaction.onChainSenderWallet !== transaction.senderWallet && <div className="mt-2 text-xs text-orange-700">On-chain signer: <span className="font-mono break-all">{transaction.onChainSenderWallet}</span></div>}</div><div className="rounded-xl border bg-white p-4"><div className="text-xs font-semibold text-gray-900">Receiver</div><div className="mt-2 text-xs">{transaction.receiverUsername ? `@${transaction.receiverUsername}` : "Unlinked account"}</div><CopyableWalletAddress address={transaction.receiverWallet} label="" className="mt-1 p-0 text-[11px] text-gray-500" /></div></div>
                      <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Transaction ID" mono>{transaction.id}</DetailItem><DetailItem label="Status">{transaction.status === "reversed" ? "refunded" : transaction.status}</DetailItem><DetailItem label="Created">{formatDateTime(transaction.createdAt)}</DetailItem><DetailItem label="Updated">{formatDateTime(transaction.updatedAt)}</DetailItem><DetailItem label="Source / destination">{transaction.sourceCurrency || "-"} → {transaction.destinationCurrency || "-"}</DetailItem><DetailItem label="Exchange rate">{transaction.appliedExchangeRate ?? "-"}</DetailItem><DetailItem label="Service fee">{transaction.appliedServiceFee ?? "-"}</DetailItem><DetailItem label="Network fee">{transaction.appliedEstimatedNetworkFee ?? "-"}</DetailItem><DetailItem label="Block number" mono>{transaction.blockNumber ?? "-"}</DetailItem><DetailItem label="Event log index" mono>{transaction.eventLogIndex ?? "-"}</DetailItem><DetailItem label="Submitted">{formatDateTime(transaction.blockchainSubmittedAt) || "-"}</DetailItem><DetailItem label="Confirmed">{formatDateTime(transaction.blockchainResultReceivedAt) || "-"}</DetailItem><DetailItem label="Blockchain time">{formatDateTime(transaction.blockchainTimestamp) || "-"}</DetailItem><DetailItem label="Last reconciled">{formatDateTime(transaction.lastReconciledAt) || "-"}</DetailItem><DetailItem label="Reconciliation misses">{transaction.reconciliationMissCount ?? 0}</DetailItem><DetailItem label="Record source">{transaction.recordSource || "-"}</DetailItem><DetailItem label="Transfer request" mono>{transaction.transferRequestKey || "-"}</DetailItem><DetailItem label="Quote ID" mono>{transaction.quoteId || "-"}</DetailItem><DetailItem label="Payment link ID" mono>{transaction.paymentLinkId || "-"}</DetailItem><DetailItem label="Chat request ID" mono>{transaction.chatRequestId || "-"}</DetailItem></dl>
                      {transaction.note && <div className="mt-5 rounded-xl bg-white p-4 text-xs"><div className="font-semibold text-gray-500">Note</div><p className="mt-1 whitespace-pre-wrap text-gray-800">{transaction.note}</p></div>}
                    </td></tr>}
                  </Fragment>);
                })}
              </tbody>
            </table>
          </div>
        )}
        {filteredTransactions.length > 0 && <div className="flex items-center justify-between"><button type="button" disabled={transactionPage === 1} onClick={() => setTransactionPage((page) => page - 1)} className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-40">← Previous</button><span className="text-xs text-gray-500">Page {transactionPage} of {transactionPageCount}</span><button type="button" disabled={transactionPage === transactionPageCount} onClick={() => setTransactionPage((page) => page + 1)} className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-40">Next →</button></div>}
      </section>}

      {overviewModal && summary && <AdminModal title={overviewModal === "users" ? "User overview" : overviewModal === "admins" ? "Administrator overview" : overviewModal === "wallets" ? "Wallet overview" : "Transaction overview"} description="Detailed system-wide breakdown" onClose={() => setOverviewModal(null)}>
        {overviewModal === "transactions" ? <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(summary.transactions?.byStatus || {}).map(([status, count]) => <button key={status} type="button" onClick={() => { setTransactionStatus(status); setOverviewModal(null); document.getElementById("transactions")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-xl border p-4 text-left hover:border-purple-300"><div className="text-xs capitalize text-gray-500">{status === "reversed" ? "refunded" : status}</div><div className="mt-1 text-2xl font-semibold">{count}</div><div className="mt-2 text-[11px] text-purple-700">Filter records →</div></button>)}</div><dl className="grid gap-4 sm:grid-cols-3"><DetailItem label="Total volume">{Number(summary.transactions?.totalVolume || 0).toFixed(4)}</DetailItem><DetailItem label="Average amount">{Number(summary.transactions?.averageAmount || 0).toFixed(4)}</DetailItem><DetailItem label="Last 24 hours">{summary.transactions?.last24Hours ?? 0}</DetailItem></dl></div> : overviewModal === "wallets" ? <div className="grid gap-3 sm:grid-cols-2">{users.map((user) => <button key={user.id} type="button" onClick={() => { setSelectedUserId(String(user.id)); setOverviewModal(null); }} className="rounded-xl border p-4 text-left hover:border-purple-300"><div className="text-sm font-medium">{userLabel(user)}</div><div className="mt-1 text-xs text-gray-500">{user.email}</div><div className="mt-2 break-all font-mono text-[11px]">{user.wallet?.address || "No wallet linked"}</div><div className="mt-1 text-[11px] text-gray-500">{user.wallet ? `${user.wallet.type} · ${user.wallet.isVerified ? "verified" : "unverified"}` : ""}</div></button>)}</div> : <div className="space-y-2">{users.filter((user) => overviewModal !== "admins" || user.role === "admin").map((user) => <button key={user.id} type="button" onClick={() => { setSelectedUserId(String(user.id)); setOverviewModal(null); }} className="flex w-full items-center justify-between rounded-xl border p-3 text-left hover:border-purple-300"><div><div className="text-sm font-medium">{userLabel(user)}</div><div className="text-xs text-gray-500">{user.email} · @{user.username}</div></div><span className={`rounded-full px-2 py-0.5 text-[10px] ${userStatusBadgeClasses(user.isDisabled)}`}>{user.isDisabled ? "Disabled" : "Active"}</span></button>)}</div>}
      </AdminModal>}

      {selectedUser && <AdminModal title={userLabel(selectedUser)} description={`${selectedUser.email} · @${selectedUser.username}`} onClose={() => setSelectedUserId(null)}>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => navigate("/admin/transactions", { state: { userFilter: selectedUser.username } })} className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700">View transaction activity</button><Link to="/admin/audit-logs" state={{ auditUser: selectedUser.username }} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-gray-50">Review audit logs</Link><button type="button" onClick={() => handleToggleUser(selectedUser)} className={`rounded-lg border px-3 py-2 text-xs font-medium ${selectedUser.isDisabled ? "border-green-300 text-green-700" : "border-red-300 text-red-700"}`}>{selectedUser.isDisabled ? "Enable account" : "Disable account"}</button></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2"><section className="rounded-xl border p-4"><h3 className="text-sm font-semibold">Identity and account</h3><dl className="mt-4 grid gap-4 sm:grid-cols-2"><DetailItem label="User ID" mono>{selectedUser.id}</DetailItem><DetailItem label="Role">{selectedUser.role}</DetailItem><DetailItem label="First name">{selectedUser.firstName || "-"}</DetailItem><DetailItem label="Last name">{selectedUser.lastName || "-"}</DetailItem><DetailItem label="Country">{selectedUser.countryOfResidence || "-"}</DetailItem><DetailItem label="Date of birth">{formatDateOnly(selectedUser.dateOfBirth) || "-"}</DetailItem><DetailItem label="Phone">{selectedUser.phoneNumber || "-"}</DetailItem><DetailItem label="Employment">{selectedUser.employmentStatus || "-"}</DetailItem><DetailItem label="Source of funds">{selectedUser.sourceOfFunds || "-"}</DetailItem><DetailItem label="Expected volume">{selectedUser.expectedMonthlyVolume || "-"}</DetailItem><DetailItem label="Email verified">{formatDateTime(selectedUser.emailVerifiedAt) || "No"}</DetailItem><DetailItem label="Phone verified">{formatDateTime(selectedUser.phoneVerifiedAt) || "No"}</DetailItem><DetailItem label="Created">{formatDateTime(selectedUser.createdAt)}</DetailItem><DetailItem label="Updated">{formatDateTime(selectedUser.updatedAt)}</DetailItem></dl></section><section className="rounded-xl border p-4"><h3 className="text-sm font-semibold">Wallet and activity</h3>{selectedUser.wallet ? <dl className="mt-4 grid gap-4 sm:grid-cols-2"><DetailItem label="Wallet" mono>{selectedUser.wallet.address}</DetailItem><DetailItem label="Type">{selectedUser.wallet.type}</DetailItem><DetailItem label="Verified">{selectedUser.wallet.isVerified ? "Yes" : "No"}</DetailItem><DetailItem label="Balance">{selectedUser.wallet.nativeBalance ?? "-"} {selectedUser.wallet.nativeBalanceSymbol || ""}</DetailItem><DetailItem label="Balance updated">{formatDateTime(selectedUser.wallet.nativeBalanceUpdatedAt) || "-"}</DetailItem><DetailItem label="Sync error">{selectedUser.wallet.balanceSyncError || "None"}</DetailItem></dl> : <p className="mt-3 text-xs text-gray-500">No wallet linked.</p>}<dl className="mt-5 grid grid-cols-2 gap-4"><DetailItem label="Sent">{selectedUser.activity?.sentCount ?? 0}</DetailItem><DetailItem label="Sent volume">{selectedUser.activity?.sentVolume ?? 0}</DetailItem><DetailItem label="Received">{selectedUser.activity?.receivedCount ?? 0}</DetailItem><DetailItem label="Received volume">{selectedUser.activity?.receivedVolume ?? 0}</DetailItem><DetailItem label="Failed sends">{selectedUser.activity?.failedSentCount ?? 0}</DetailItem><DetailItem label="Account status">{selectedUser.isDisabled ? "Disabled" : "Active"}</DetailItem></dl></section></div>
      </AdminModal>}
    </PageContainer>
  );
}
