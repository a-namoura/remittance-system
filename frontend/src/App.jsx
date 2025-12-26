import { Routes, Route, Navigate, Link } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="flex items-center justify-between px-6 py-4 bg-white shadow">
        <div className="font-bold">Remittance System</div>
        <div className="flex gap-4">
          <Link className="text-blue-600" to="/login">Login</Link>
          <Link className="text-blue-600" to="/register">Register</Link>
          <Link className="text-blue-600" to="/dashboard">Dashboard</Link>
        </div>
      </nav>

      <div className="p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </div>
  );
}
