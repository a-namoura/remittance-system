import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { PageContainer, PageError, PageHeader, PageLoading } from "../components/PageLayout.jsx";
import BackButton from "../components/BackButton.jsx";
import { apiRequest } from "../services/api.js";
import { requireAuthToken } from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";
import { getUserErrorMessage } from "../utils/userError.js";

const EMPTY_FILTERS = { search: "", user: "", action: "", role: "", ip: "", from: "", to: "" };

export default function AdminAuditLogs() {
  const location = useLocation();
  const initialFilters = { ...EMPTY_FILTERS, user: location.state?.auditUser || "" };
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterOptions, setFilterOptions] = useState({ actions: [], ips: [], users: [] });
  const pageCount = Math.max(1, Math.ceil(total / 20));

  useEffect(() => {
    let isCancelled = false;
    async function loadAuditLogs() {
      const token = requireAuthToken({ message: "You must be logged in as an admin to view this page.", onMissing: (message) => { if (!isCancelled) { setError(message); setLoading(false); } } });
      if (!token) return;
      try {
        setLoading(true);
        setError("");
        const params = new URLSearchParams({ limit: "20", page: String(page) });
        Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
        const data = await apiRequest(`/api/admin/audit-logs?${params}`, { token });
        if (isCancelled) return;
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      } catch (err) {
        if (!isCancelled) setError(getUserErrorMessage(err, "Failed to load audit logs."));
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    loadAuditLogs();
    return () => { isCancelled = true; };
  }, [filters, page]);

  useEffect(() => {
    const token = requireAuthToken({ message: "You must be logged in as an admin." });
    if (!token) return;
    apiRequest("/api/admin/audit-log-options", { token })
      .then((data) => setFilterOptions({ actions: data.actions || [], ips: data.ips || [], users: data.users || [] }))
      .catch(() => {});
  }, []);

  function updateFilter(name, value) { setDraftFilters((current) => ({ ...current, [name]: value })); }
  function applyFilters(event) { event.preventDefault(); setPage(1); setFilters(draftFilters); }
  function clearFilters() { setDraftFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPage(1); }

  return (
    <PageContainer stack className="gap-4">
      <div><BackButton fallback="/admin" label="Back" /></div>
      <PageHeader title="Audit Logs" description="Search and filter every recorded administrative and system action." />
      <PageError>{error}</PageError>

      <form onSubmit={applyFilters} className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-gray-600">Search everything<input value={draftFilters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Username, action, endpoint, agent or IP" className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-purple-500" /></label>
          <label className="text-xs text-gray-600">User<select value={draftFilters.user} onChange={(event) => updateFilter("user", event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 outline-none focus:border-purple-500"><option value="">Any user</option>{filterOptions.users.map((username) => <option key={username} value={username}>@{username}</option>)}</select></label>
          <label className="text-xs text-gray-600">Action<select value={draftFilters.action} onChange={(event) => updateFilter("action", event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-mono outline-none focus:border-purple-500"><option value="">Any action</option>{filterOptions.actions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
          <label className="text-xs text-gray-600">User role<select value={draftFilters.role} onChange={(event) => updateFilter("role", event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 outline-none focus:border-purple-500"><option value="">All roles</option><option value="admin">Admin</option><option value="user">User</option></select></label>
          <label className="text-xs text-gray-600">IP address<input list="audit-ip-options" value={draftFilters.ip} onChange={(event) => updateFilter("ip", event.target.value)} placeholder="Any IP address" className="mt-1 w-full rounded-lg border px-3 py-2 font-mono outline-none focus:border-purple-500" /><datalist id="audit-ip-options">{filterOptions.ips.map((ip) => <option key={ip} value={ip} />)}</datalist></label>
          <label className="text-xs text-gray-600">From date <span className="text-gray-400">(blank = any)</span><input type="date" value={draftFilters.from} onChange={(event) => updateFilter("from", event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-purple-500" /></label>
          <label className="text-xs text-gray-600">To date <span className="text-gray-400">(blank = any)</span><input type="date" value={draftFilters.to} onChange={(event) => updateFilter("to", event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-purple-500" /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-gray-500">{total} matching log{total === 1 ? "" : "s"}</span><div className="flex gap-2"><button type="button" onClick={clearFilters} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-gray-50">Clear filters</button><button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700">Apply filters</button></div></div>
      </form>

      <div className="overflow-hidden rounded-xl border bg-white divide-y">
        {loading && !error && <PageLoading>Loading audit logs</PageLoading>}
        {!loading && logs.length === 0 && !error && <div className="p-4 text-sm text-gray-600">No audit logs match these filters.</div>}
        {!loading && logs.map((log) => <details key={log.id} className="group p-4 open:bg-purple-50/30"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium text-gray-900">{log.action}</div><div className="mt-1 text-xs text-gray-600">{log.userUsername ? `@${log.userUsername}` : log.userEmail || "Unknown user"}{log.userRole ? ` · ${log.userRole}` : ""}</div></div><div className="text-right"><div className="text-xs text-gray-500">{formatDateTime(log.createdAt) || "-"}</div><div className="mt-1 font-mono text-[11px] text-gray-500">{log.ip || "No IP"}</div><span className="mt-1 inline-block text-[11px] font-medium text-purple-700 group-open:hidden">View full log</span></div></div></summary><dl className="mt-4 grid gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2"><div><dt className="text-[10px] uppercase text-gray-500">Log ID</dt><dd className="mt-1 break-all font-mono text-xs">{log.id}</dd></div><div><dt className="text-[10px] uppercase text-gray-500">User agent</dt><dd className="mt-1 break-words text-xs">{log.userAgent || "Not recorded"}</dd></div></dl>{log.metadata && Object.keys(log.metadata).length > 0 && <div className="mt-3"><div className="text-[10px] font-semibold uppercase text-gray-500">Metadata</div><pre className="mt-1 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{JSON.stringify(log.metadata, null, 2)}</pre></div>}<button type="button" onClick={(event) => { event.currentTarget.closest("details").open = false; }} className="mt-3 text-xs font-medium text-purple-700 hover:underline">← Back to audit logs</button></details>)}
      </div>

      {total > 0 && <div className="flex items-center justify-between"><button type="button" disabled={page === 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-40">← Previous</button><span className="text-xs text-gray-500">Page {page} of {pageCount}</span><button type="button" disabled={page === pageCount || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-40">Next →</button></div>}
    </PageContainer>
  );
}
