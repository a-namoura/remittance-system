import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api.js";

export default function Navbar() {
  const [me, setMe] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setMe(null);
      setLoadingMe(false);
      return;
    }

    setLoadingMe(true);
    apiRequest("/api/me", { token })
      .then((data) => setMe(data.user))
      .catch(() => setMe(null))
      .finally(() => setLoadingMe(false));
  }, [location.pathname]);

  async function handleLogout() {
    const token = localStorage.getItem("token");

    try {
      if (token) {
        await apiRequest("/api/auth/logout", {
          method: "POST",
          token,
        });
      }
    } catch (err) {
      // Don’t block logout if audit/log call fails
      console.error("Logout error:", err.message);
    } finally {
      localStorage.removeItem("token");
      setMe(null);
      navigate("/login");
    }
  }

  const isAuthPage =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/register");

  return (
    <header className="bg-white border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-bold">
            R
          </span>
          <span className="font-semibold text-sm sm:text-base text-gray-900">
            Remittance System
          </span>
        </Link>

        {/* Right side */}
        <nav className="flex items-center gap-3 text-sm">
          {!loadingMe && !me && !isAuthPage && (
            <>
              <Link
                to="/login"
                className="px-3 py-1.5 rounded-md border text-gray-700 hover:bg-gray-50 transition"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition"
              >
                Register
              </Link>
            </>
          )}

          {!loadingMe && !me && isAuthPage && null}

          {!loadingMe && me && (
            <>
              <Link
                to="/dashboard"
                className="hidden sm:inline-block px-3 py-1.5 rounded-md hover:bg-gray-50 transition"
              >
                Dashboard
              </Link>

              <Link
                to="/transactions"
                className="hidden sm:inline-block px-3 py-1.5 rounded-md hover:bg-gray-50 transition"
              >
                Transactions
              </Link>

              {me.role === "admin" && (
                <>
                  <Link
                    to="/admin"
                    className="hidden sm:inline-block px-3 py-1.5 rounded-md hover:bg-gray-50 transition"
                  >
                    Admin
                  </Link>
                  <Link
                    to="/admin/audit-logs"
                    className="hidden sm:inline-block px-3 py-1.5 rounded-md hover:bg-gray-50 transition"
                  >
                    Audit Logs
                  </Link>
                </>
              )}

              <span className="hidden sm:inline text-xs text-gray-500">
                {me.email}
              </span>

              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-md border text-gray-700 hover:bg-gray-50 transition"
              >
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
