import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, logoutCurrentUser } from "../services/authApi.js";
import { clearSessionStorage, getAuthToken } from "../services/session.js";

function isActivePath(currentPath, targetPath) {
  if (targetPath === "/dashboard") {
    return currentPath === "/dashboard";
  }
  return currentPath.startsWith(targetPath);
}

export default function Navbar() {
  const [me, setMe] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const location = useLocation();
  const navigate = useNavigate();

  const appNavItems = useMemo(
    () => [
      { to: "/dashboard", label: "Home" },
      { to: "/account", label: "Account" },
      { to: "/friends", label: "Friends" },
      { to: "/transactions", label: "Activity" },
      { to: "/send", label: "Send" },
    ],
    []
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadCurrentUser() {
      const token = getAuthToken();
      if (!token) {
        if (!isCancelled) {
          setMe(null);
          setLoadingMe(false);
        }
        return;
      }

      try {
        setLoadingMe(true);
        const user = await getCurrentUser({ token });
        if (!isCancelled) {
          setMe(user);
        }
      } catch {
        if (!isCancelled) {
          setMe(null);
        }
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
      // do not block local logout on API error
    } finally {
      clearSessionStorage();
      setMe(null);
      navigate("/", { replace: true });
    }
  }

  const isAuthPage =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/register") ||
    location.pathname.startsWith("/forgot-password");

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-white text-sm font-bold">
              R
            </span>
            <span className="truncate text-sm sm:text-base font-semibold tracking-wide text-gray-900">
              Remittance System
            </span>
          </Link>

          {!loadingMe && !me && !isAuthPage && (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="rounded-full bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                Register
              </Link>
            </div>
          )}

          {!loadingMe && me && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
                {me.username}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {!loadingMe && me && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {appNavItems.map((item) => {
              const active = isActivePath(location.pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {me.role === "admin" && (
              <>
                <Link
                  to="/admin"
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    isActivePath(location.pathname, "/admin")
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  }`}
                >
                  Admin
                </Link>
                <Link
                  to="/admin/audit-logs"
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    isActivePath(location.pathname, "/admin/audit-logs")
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  }`}
                >
                  Audit
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
