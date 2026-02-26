import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import GlobalRequestFeedback from "./components/GlobalRequestFeedback.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ClaimTransfer from "./pages/ClaimTransfer.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Account from "./pages/Account.jsx";
import Friends from "./pages/Friends.jsx";
import RequestMoney from "./pages/RequestMoney.jsx";
import Chat from "./pages/Chat.jsx";
import SendMoney from "./pages/SendMoney.jsx";
import Transactions from "./pages/Transactions.jsx";
import TransactionDetails from "./pages/TransactionDetails.jsx";
import Admin from "./pages/Admin.jsx";
import AdminAuditLogs from "./pages/AdminAuditLogs.jsx";

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
  { path: "/friends", element: <Friends /> },
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

function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
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
    <div className="min-h-screen bg-gray-50">
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

      <Routes>
        {PUBLIC_ROUTES.map(({ path, element }) => (
          <Route
            key={path}
            path={path}
            element={
              <PublicLayout>
                {element}
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
                  {element}
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
                  {element}
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

