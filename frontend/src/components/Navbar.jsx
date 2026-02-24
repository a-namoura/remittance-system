import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, logoutCurrentUser } from "../services/authApi.js";
import { listChatFriends } from "../services/chatApi.js";
import {
  countUnreadConversations,
  subscribeChatUnreadUpdates,
} from "../services/chatUnread.js";
import { clearSessionStorage, getAuthToken } from "../services/session.js";
import ThemeToggle from "./ThemeToggle.jsx";

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

const NAVBAR_CHAT_SYNC_MS = 3000;
const NAVBAR_BADGE_PULSE_MS = 700;

export default function Navbar() {
  const [me, setMe] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [pulseUnreadBadge, setPulseUnreadBadge] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const unreadSyncTimerRef = useRef(null);
  const unreadSyncBusyRef = useRef(false);
  const unreadPulseTimerRef = useRef(null);
  const previousUnreadCountRef = useRef(null);

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

  useEffect(() => {
    let isCancelled = false;

    if (!me?.id) {
      setChatUnreadCount(0);
      return undefined;
    }

    async function refreshUnreadCount() {
      if (isCancelled || unreadSyncBusyRef.current) return;
      unreadSyncBusyRef.current = true;

      try {
        const token = getAuthToken();
        if (!token || !me?.id) {
          if (!isCancelled) {
            setChatUnreadCount(0);
          }
          return;
        }

        const response = await listChatFriends({
          token,
          trackRequest: false,
        });

        if (isCancelled) return;
        const nextUnread = countUnreadConversations({
          friends: response?.friends || [],
          viewerUserId: me.id,
        });
        setChatUnreadCount(nextUnread);
      } catch {
        // keep previous unread badge value on transient sync errors
      } finally {
        unreadSyncBusyRef.current = false;
      }
    }

    async function syncUnreadLoop() {
      if (isCancelled) return;
      await refreshUnreadCount();
      if (!isCancelled) {
        unreadSyncTimerRef.current = window.setTimeout(syncUnreadLoop, NAVBAR_CHAT_SYNC_MS);
      }
    }

    const handleVisibleRefresh = () => {
      if (document.visibilityState === "hidden") return;
      refreshUnreadCount();
    };

    syncUnreadLoop();

    const unsubscribeUnreadEvents = subscribeChatUnreadUpdates(() => {
      refreshUnreadCount();
    });

    window.addEventListener("focus", handleVisibleRefresh);
    window.addEventListener("online", handleVisibleRefresh);
    document.addEventListener("visibilitychange", handleVisibleRefresh);

    return () => {
      isCancelled = true;
      unreadSyncBusyRef.current = false;
      if (unreadSyncTimerRef.current != null) {
        window.clearTimeout(unreadSyncTimerRef.current);
        unreadSyncTimerRef.current = null;
      }
      unsubscribeUnreadEvents();
      window.removeEventListener("focus", handleVisibleRefresh);
      window.removeEventListener("online", handleVisibleRefresh);
      document.removeEventListener("visibilitychange", handleVisibleRefresh);
    };
  }, [me?.id]);

  useEffect(() => {
    const previousUnread = previousUnreadCountRef.current;

    if (
      previousUnread != null &&
      Number(chatUnreadCount) > Number(previousUnread)
    ) {
      setPulseUnreadBadge(true);
      if (unreadPulseTimerRef.current != null) {
        window.clearTimeout(unreadPulseTimerRef.current);
      }
      unreadPulseTimerRef.current = window.setTimeout(() => {
        setPulseUnreadBadge(false);
        unreadPulseTimerRef.current = null;
      }, NAVBAR_BADGE_PULSE_MS);
    } else if (Number(chatUnreadCount) <= 0) {
      setPulseUnreadBadge(false);
      if (unreadPulseTimerRef.current != null) {
        window.clearTimeout(unreadPulseTimerRef.current);
        unreadPulseTimerRef.current = null;
      }
    }

    previousUnreadCountRef.current = Number(chatUnreadCount) || 0;
  }, [chatUnreadCount]);

  useEffect(
    () => () => {
      if (unreadPulseTimerRef.current != null) {
        window.clearTimeout(unreadPulseTimerRef.current);
        unreadPulseTimerRef.current = null;
      }
    },
    []
  );

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

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />

            {!loadingMe && !me && !isAuthPage && (
              <Link
                to="/login"
                className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Login
              </Link>
            )}

            {!loadingMe && !me && !isAuthPage && (
              <Link
                to="/register"
                className="rounded-full bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                Register
              </Link>
            )}

            {!loadingMe && me && (
              <>
                <Link
                  to="/chat"
                  aria-label={
                    chatUnreadCount > 0
                      ? `Open chat (${chatUnreadCount} unread)`
                      : "Open chat"
                  }
                  title="Chat"
                  className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition ${
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
                  {chatUnreadCount > 0 ? (
                    <>
                      {pulseUnreadBadge ? (
                        <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 rounded-full bg-red-400 opacity-75 animate-ping" />
                      ) : null}
                      <span
                        className={`absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white transition-transform duration-150 ${
                          pulseUnreadBadge ? "scale-110" : "scale-100"
                        }`}
                      >
                        {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                      </span>
                    </>
                  ) : null}
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
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}


