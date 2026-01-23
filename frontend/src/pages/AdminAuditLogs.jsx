import { useEffect, useState } from "react";
import { apiRequest } from "../services/api.js";

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("You must be logged in as an admin to view this page.");
      return;
    }

    apiRequest("/api/admin/audit-logs?limit=50", { token })
      .then((d) => setLogs(d.logs || []))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="text-sm text-gray-600 mt-1">
          Trace key actions such as login, logout, remittance sends, and admin
          access.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-100 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border rounded-xl divide-y">
        {logs.length === 0 && !error && (
          <div className="p-3 text-sm text-gray-600">
            No audit logs found.
          </div>
        )}

        {logs.map((l) => (
          <div key={l.id} className="p-3 text-sm">
            <div className="font-medium">
              {l.action} — {l.userEmail}{" "}
              {l.role && (
                <span className="text-xs text-gray-500">({l.role})</span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {new Date(l.createdAt).toLocaleString()} | IP: {l.ip || "N/A"}
            </div>
            {l.metadata && Object.keys(l.metadata).length > 0 && (
              <pre className="text-xs bg-gray-50 p-2 mt-1 rounded overflow-x-auto">
                {JSON.stringify(l.metadata, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
