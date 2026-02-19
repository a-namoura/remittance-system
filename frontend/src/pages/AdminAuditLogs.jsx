import { useEffect, useState } from "react";
import { apiRequest } from "../services/api.js";
import { getAuthToken } from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";

import { getUserErrorMessage } from "../utils/userError.js";
export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadAuditLogs() {
      const token = getAuthToken();
      if (!token) {
        if (!isCancelled) {
          setError("You must be logged in as an admin to view this page.");
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError("");
        const data = await apiRequest("/api/admin/audit-logs?limit=50", { token });
        if (isCancelled) return;
        setLogs(data.logs || []);
      } catch (err) {
        if (isCancelled) return;
        setError(getUserErrorMessage(err, "Failed to load audit logs."));
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadAuditLogs();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="text-sm text-gray-600 mt-1">
          Trace key actions such as login, logout, payment sends, and admin
          access.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-100 text-red-700 text-sm">{error}</div>
      )}

      <div className="bg-white border rounded-xl divide-y">
        {loading && !error && (
          <div className="p-3 text-sm text-gray-600">Loading audit logs...</div>
        )}

        {!loading && logs.length === 0 && !error && (
          <div className="p-3 text-sm text-gray-600">No audit logs found.</div>
        )}

        {logs.map((log) => (
          <div key={log.id} className="p-3 text-sm">
            <div className="font-medium">
              {log.action} - {log.userEmail || "Unknown user"}{" "}
              {log.userRole && (
                <span className="text-xs text-gray-500">({log.userRole})</span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {formatDateTime(log.createdAt) || "-"} | IP: {log.ip || "N/A"}
            </div>
            {log.metadata && Object.keys(log.metadata).length > 0 && (
              <pre className="text-xs bg-gray-50 p-2 mt-1 rounded overflow-x-auto">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
