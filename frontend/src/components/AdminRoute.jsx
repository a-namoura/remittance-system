import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiRequest } from "../services/api.js";

export default function AdminRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkAdmin() {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        setIsAdmin(false);
        setError("");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const data = await apiRequest("/api/me", { token });
        if (data.user && data.user.role === "admin") {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          setError("You do not have permission to view this page.");
        }
      } catch (err) {
        setIsAdmin(false);
        setError(err.message || "Failed to verify permissions.");
      } finally {
        setLoading(false);
      }
    }

    checkAdmin();
  }, []);

  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-gray-600">
        Checking admin permissions…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-3">
        <h1 className="text-xl font-semibold text-gray-900">Access denied</h1>
        <p className="text-sm text-gray-600">
          {error || "You do not have permission to view this page."}
        </p>
        <a
          href="/dashboard"
          className="inline-flex text-sm text-blue-600 hover:underline"
        >
          Go back to dashboard
        </a>
      </div>
    );
  }

  return children;
}
