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

const NAVBAR_CHAT_SYNC_MS = 3000;
const NAVBAR_BADGE_PULSE_MS = 700;

const BASE_NAV_GROUPS = [
  {
    title: null,
    items: [
      { to: "/dashboard", label: "Home", icon: "home" },
      { to: "/account", label: "Account", icon: "account" },
      { to: "/transactions", label: "Activity", icon: "activity" },
    ],
  },
  {
    title: "Payments",
    items: [
      { to: "/request", label: "Request", icon: "request" },
      { to: "/send", label: "Send", icon: "send" },
    ],
  },
  {
    title: "Social",
    items: [
      { to: "/friends", label: "Friends", icon: "friends" },
      { to: "/chat", label: "Chat", icon: "chat" },
    ],
  },
];

const ADMIN_NAV_GROUP = {
  title: "Admin",
  items: [
    { to: "/admin", label: "Dashboard", icon: "admin" },
    { to: "/admin/audit-logs", label: "Audit logs", icon: "audit" },
  ],
};

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

function navIcon(name) {
  if (name === "home") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m3 10.5 9-7 9 7" />
        <path d="M5.5 9.5V20h13V9.5" />
      </svg>
    );
  }

  if (name === "account") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
        <circle cx="12" cy="10" r="2.7" />
        <path d="M7.6 17a4.5 4.5 0 0 1 8.8 0" />
      </svg>
    );
  }

  if (name === "activity") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 18V6M12 18v-5M19 18V9" />
        <path d="M5 13.5 12 9l7 2.5" />
      </svg>
    );
  }

  if (name === "request") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 8.5h-6.5a3 3 0 1 0 0 6H17" />
        <path d="m14.5 12 2.5 2.5L19.5 12" />
      </svg>
    );
  }

  if (name === "send") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 12 20 4l-4 16-3.4-4.6L8 12.7Z" />
      </svg>
    );
  }

  if (name === "friends") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="9" r="2.7" />
        <path d="M4.8 18.2a4.8 4.8 0 0 1 8.4 0" />
        <path d="M17.4 8.2v4.4M15.2 10.4h4.4" />
      </svg>
    );
  }

  if (name === "chat") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4.2 6.6A2.6 2.6 0 0 1 6.8 4h10.4a2.6 2.6 0 0 1 2.6 2.6v6.8a2.6 2.6 0 0 1-2.6 2.6H9.1L4.8 19.3a.5.5 0 0 1-.8-.4Z" />
        <path d="M8 9h8M8 12h5" />
      </svg>
    );
  }

  if (name === "admin") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3.8 5.8 6.4v5.3c0 3.7 2.5 7.1 6.2 8.3 3.7-1.2 6.2-4.6 6.2-8.3V6.4L12 3.8Z" />
        <path d="M9.4 12.2 11.2 14l3.4-3.4" />
      </svg>
    );
  }

  if (name === "audit") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 5.3h8M8.5 4h7a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        <path d="M9.2 9.2h5.6M9.2 12.2h5.6M9.2 15.2h3.4" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4.3 3.2A.5.5 0 0 1 4 18.8V6.5Z" />
      <path d="M8 8.5h8M8 11.5h5" />
    </svg>
  );
}

export default function Navbar({
  sidebarCollapsed = false,
  onToggleSidebar = () => {},
}) {
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

  const navGroups = useMemo(
    () => (me?.role === "admin" ? [...BASE_NAV_GROUPS, ADMIN_NAV_GROUP] : BASE_NAV_GROUPS),
    [me?.role]
  );

  const mobileNavItems = useMemo(
    () => navGroups.flatMap((group) => group.items),
    [navGroups]
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

  const displayName =
    [me?.firstName, me?.lastName].filter(Boolean).join(" ").trim() ||
    me?.username ||
    "Member";

  const desktopLeftOffset = sidebarCollapsed ? "md:left-20" : "md:left-48";

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-gray-200 bg-white/95 backdrop-blur transition-[width] duration-200 md:flex ${
          sidebarCollapsed ? "w-20" : "w-48"
        }`}
      >
        <div className="flex h-16 items-center justify-start border-b border-gray-200 pl-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {navGroups.map((group) => (
            <div key={group.title || "core"}>
              {group.title && !sidebarCollapsed ? (
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                  {group.title}
                </p>
              ) : null}

              <div className={`${group.title && !sidebarCollapsed ? "mt-2" : ""} space-y-1`}>
                {group.items.map((item) => {
                  const active = isActivePath(location.pathname, item.to);
                  const showChatBadge = item.to === "/chat" && chatUnreadCount > 0;

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={`group relative flex items-center gap-3 rounded-xl text-sm font-medium transition ${
                        sidebarCollapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
                      } ${
                        active
                          ? "bg-purple-600 text-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center">
                        {navIcon(item.icon)}
                      </span>

                      {!sidebarCollapsed ? <span className="truncate">{item.label}</span> : null}

                      {showChatBadge ? (
                        sidebarCollapsed ? (
                          <span className="absolute right-2 top-2 inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                        ) : (
                          <span
                            className={`ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-4 ${
                              active ? "bg-white/20 text-white" : "bg-red-500 text-white"
                            }`}
                          >
                            {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                          </span>
                        )
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <header className={`fixed left-0 right-0 top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur ${desktopLeftOffset}`}>
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onToggleSidebar}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:bg-gray-100 md:hidden"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>

            <p className="hidden truncate text-sm text-gray-600 lg:block">
              {loadingMe ? "Loading your workspace..." : `${displayName}`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />

            <Link
              to="/chat"
              aria-label={
                chatUnreadCount > 0
                  ? `Open chat (${chatUnreadCount} unread)`
                  : "Open chat"
              }
              title="Chat"
              className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold transition ${
                location.pathname.startsWith("/chat")
                  ? "border-purple-600 bg-purple-600 text-white"
                  : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}
            >
              {navIcon("chat")}

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

            {!loadingMe && me ? (
              <>
                <div className="hidden text-right sm:block">
                  <p className="max-w-[180px] truncate text-sm font-semibold text-gray-900">
                    {displayName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {me.role === "admin" ? "Administrator" : "Member"}
                  </p>
                </div>
                <span
                  title={displayName}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-xs font-semibold text-white"
                >
                  {profileInitials}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Logout
                </button>
              </>
            ) : (
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">
                ...
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 px-3 py-2 md:hidden">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {mobileNavItems.map((item) => {
              const active = isActivePath(location.pathname, item.to);
              const showChatBadge = item.to === "/chat" && chatUnreadCount > 0;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`relative whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {item.label}
                  {showChatBadge ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
                      {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      </header>
    </>
  );
}
