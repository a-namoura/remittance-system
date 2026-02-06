import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import SendMoney from "./pages/SendMoney.jsx";
import Transactions from "./pages/Transactions.jsx";
import TransactionDetails from "./pages/TransactionDetails.jsx";
import Admin from "./pages/Admin.jsx";
import AdminAuditLogs from "./pages/AdminAuditLogs.jsx";

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
      {/* PUBLIC (NO NAVBAR) */}
      <Route
        path="/"
        element={
          <PublicLayout>
            <Landing />
          </PublicLayout>
        }
      />

      <Route
        path="/login"
        element={
          <PublicLayout>
            <Login />
          </PublicLayout>
        }
      />

      <Route
        path="/register"
        element={
          <PublicLayout>
            <Register />
          </PublicLayout>
        }
      />

      {/* PROTECTED (WITH NAVBAR) */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <Dashboard />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/send"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <SendMoney />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <Transactions />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/transactions/:id"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <TransactionDetails />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <Admin />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/audit-logs"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <AdminAuditLogs />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      { /* CATCH ALL - REDIRECT TO HOME */ }
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
