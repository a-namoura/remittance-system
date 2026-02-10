import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
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
];

const PROTECTED_ROUTES = [
  { path: "/dashboard", element: <Dashboard /> },
  { path: "/send", element: <SendMoney /> },
  { path: "/transactions", element: <Transactions /> },
  { path: "/transactions/:id", element: <TransactionDetails /> },
];

const ADMIN_ROUTES = [
  { path: "/admin", element: <Admin /> },
  { path: "/admin/audit-logs", element: <AdminAuditLogs /> },
];

function PublicLayout({ children }) {
  return <div className="min-h-screen bg-gray-50">{children}</div>;
}

function AuthenticatedLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      {children}
    </div>
  );
}

export default function App() {
  return (
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
  );
}
