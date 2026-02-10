import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, logoutCurrentUser } from "../services/authApi.js";
import { clearSessionStorage, getAuthToken } from "../services/session.js";

export default function Navbar() {
  const [me, setMe] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let isCancelled = false;

    async function loadCurrentUser() {
      const token = getAuthToken();
      if (!token) {
        if (isCancelled) return;
        setMe(null);
        setLoadingMe(false);
        return;
      }

      try {
        setLoadingMe(true);
        const user = await getCurrentUser({ token });
        if (isCancelled) return;
        setMe(user);
      } catch {
        if (isCancelled) return;
        setMe(null);
      } finally {
        if (!isCancelled) {
          setLoadingMe(false);
        }
      }
    }

    loadCurrentUser();

    return () => {
      isCancelled = true;
    };
  }, [location.pathname]);

  async function handleLogout() {
    const token = getAuthToken();

    try {
      if (token) {
        await logoutCurrentUser({ token });
      }
    } catch {
      // ignore logout call errors and still clear local session
    } finally {
      clearSessionStorage();
      setMe(null);
      navigate("/", { replace: true });
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
                {me.username}
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
