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

function getUserInitials(user) {
  const firstName = String(user?.firstName || "").trim();
  const lastName = String(user?.lastName || "").trim();

  const nameInitials = [firstName, lastName]
    .map((value) => value.charAt(0))
    .join("")
    .toUpperCase();
  if (nameInitials) {
    return nameInitials;
  }

  const username = String(user?.username || "").trim();
  if (!username) return "U";

  const parts = username.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  }

  return username.slice(0, 2).toUpperCase();
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
      { to: "/request", label: "Request" },
      { to: "/send", label: "Send" },
    ],
    []
  );

  const profileInitials = useMemo(() => getUserInitials(me), [me]);

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
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!loadingMe && me ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
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
          ) : (
            <Link to="/" className="inline-flex items-center">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-white text-sm font-bold">
                R
              </span>
            </Link>
          )}

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
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/chat"
                aria-label="Open chat"
                title="Chat"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition ${
                  location.pathname.startsWith("/chat")
                    ? "border-purple-600 bg-purple-600 text-white"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4.3 3.2A.5.5 0 0 1 4 18.8V6.5Z" />
                  <path d="M8 8.5h8M8 11.5h5" />
                </svg>
              </Link>
              <span
                title={
                  [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
                  me.username ||
                  "User"
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-xs font-semibold text-white"
              >
                {profileInitials}
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
      </div>
    </header>
  );
}
