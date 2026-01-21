import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import SendMoney from "./pages/SendMoney.jsx";
import Transactions from "./pages/Transactions.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        <Route path="/send" element={<SendMoney />} />
        <Route path="/transactions" element={<Transactions />} />
      </Routes>
    </div>
  );
}
