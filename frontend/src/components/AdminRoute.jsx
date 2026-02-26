import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { getCurrentUser } from "../services/authApi.js";
import { requireAuthToken } from "../services/session.js";

import { getUserErrorMessage } from "../utils/userError.js";
export default function AdminRoute({ children }) {
  const token = requireAuthToken();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function validateAdminRole() {
      if (!token) {
        if (isCancelled) return;
        setLoading(false);
        setIsAdmin(false);
        setError("");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const user = await getCurrentUser({ token });
        if (isCancelled) return;

        if (user?.role === "admin") {
          setIsAdmin(true);
          return;
        }

        setIsAdmin(false);
        setError("You do not have permission to view this page.");
      } catch (err) {
        if (isCancelled) return;
        setIsAdmin(false);
        setError(getUserErrorMessage(err, "Failed to verify permissions."));
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    validateAdminRole();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-gray-600">
        Checking admin permissions...
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
        <Link
          to="/dashboard"
          className="inline-flex text-sm text-blue-600 hover:underline"
        >
          Go back to dashboard
        </Link>
      </div>
    );
  }

  return children;
}
