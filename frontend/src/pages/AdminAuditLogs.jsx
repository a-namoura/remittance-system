import { useEffect, useState } from "react";
import { PageContainer, PageError, PageHeader } from "../components/PageLayout.jsx";
import { apiRequest } from "../services/api.js";
import { requireAuthToken } from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";

import { getUserErrorMessage } from "../utils/userError.js";
export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadAuditLogs() {
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
    <PageContainer stack className="gap-4">
      <PageHeader
        title="Audit Logs"
        description="Trace key actions such as login, logout, payment sends, and admin access."
      />

      <PageError>{error}</PageError>

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
    </PageContainer>
  );
}
