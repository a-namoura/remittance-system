import { Navigate } from "react-router-dom";
import { requireAuthToken } from "../services/session.js";

export default function ProtectedRoute({ children }) {
  const token = requireAuthToken();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
