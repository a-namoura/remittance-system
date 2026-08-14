import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import GlobalRequestFeedback from "./components/GlobalRequestFeedback.jsx";
import SystemNotifications from "./components/SystemNotifications.jsx";
import { PageLoading } from "./components/PageLayout.jsx";

const Landing = lazy(() => import("./pages/Landing.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Register = lazy(() => import("./pages/Register.jsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));
const ClaimTransfer = lazy(() => import("./pages/ClaimTransfer.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Account = lazy(() => import("./pages/Account.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Blocked = lazy(() => import("./pages/Blocked.jsx"));
const MyData = lazy(() => import("./pages/MyData.jsx"));
const Friends = lazy(() => import("./pages/Friends.jsx"));
const RequestMoney = lazy(() => import("./pages/RequestMoney.jsx"));
const Chat = lazy(() => import("./pages/Chat.jsx"));
const SendMoney = lazy(() => import("./pages/SendMoney.jsx"));
const Transactions = lazy(() => import("./pages/Transactions.jsx"));
const TransactionDetails = lazy(() => import("./pages/TransactionDetails.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));
const AdminAuditLogs = lazy(() => import("./pages/AdminAuditLogs.jsx"));

const PUBLIC_ROUTES = [
  { path: "/", element: <Landing /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/claim-transfer", element: <ClaimTransfer /> },
];

const PROTECTED_ROUTES = [
  { path: "/dashboard", element: <Dashboard /> },
  { path: "/account", element: <Account /> },
  { path: "/profile", element: <Profile /> },
  { path: "/settings", element: <Settings /> },
  { path: "/settings/blocked", element: <Blocked /> },
  { path: "/settings/data", element: <MyData /> },
  { path: "/contacts", element: <Friends /> },
  { path: "/friends", element: <Navigate to="/contacts" replace /> },
  { path: "/request", element: <RequestMoney /> },
  { path: "/request-money", element: <Navigate to="/request" replace /> },
  { path: "/chat", element: <Chat /> },
  { path: "/send", element: <SendMoney /> },
  { path: "/send-money", element: <Navigate to="/send" replace /> },
  { path: "/transactions", element: <Transactions /> },
  { path: "/transactions/:id", element: <TransactionDetails /> },
];

const ADMIN_ROUTES = [
  { path: "/admin", element: <Admin /> },
  { path: "/admin/audit-logs", element: <AdminAuditLogs /> },
];

function RouteLoading() {
  return <PageLoading className="m-6">Loading page...</PageLoading>;
}

function PublicLayout({ children }) {
  return (
    <div className="app-shell">
      <div className="fixed right-4 top-4 z-40">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}

function AuthenticatedLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar-collapsed") === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  return (
    <div className="app-shell">
      <Navbar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
      />
      <main
        className={`app-auth-main pt-28 transition-[padding] duration-200 md:pt-16 ${
          sidebarCollapsed ? "md:pl-20" : "md:pl-48"
        }`}
      >
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const location = useLocation();

  return (
    <>
      <GlobalRequestFeedback key={`${location.pathname}${location.search}`} />
      <SystemNotifications />

      <Routes>
        {PUBLIC_ROUTES.map(({ path, element }) => (
          <Route
            key={path}
            path={path}
            element={
              <PublicLayout>
                <Suspense fallback={<RouteLoading />}>{element}</Suspense>
              </PublicLayout>
            }
          />
        ))}

        {PROTECTED_ROUTES.map(({ path, element }) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <Suspense fallback={<RouteLoading />}>{element}</Suspense>
                </AuthenticatedLayout>
              </ProtectedRoute>
            }
          />
        ))}

        {ADMIN_ROUTES.map(({ path, element }) => (
          <Route
            key={path}
            path={path}
            element={
              <AdminRoute>
                <AuthenticatedLayout>
                  <Suspense fallback={<RouteLoading />}>{element}</Suspense>
                </AuthenticatedLayout>
              </AdminRoute>
            }
          />
        ))}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

