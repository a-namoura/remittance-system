import { Navigate } from "react-router-dom";
import { getAuthToken } from "../services/session.js";

export default function ProtectedRoute({ children }) {
  const token = getAuthToken();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
