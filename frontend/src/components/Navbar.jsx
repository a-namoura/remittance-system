import { Link, useLocation, useNavigate } from "react-router-dom";

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  // Hide navbar completely on auth pages
  if (location.pathname === "/login" || location.pathname === "/register") {
    return null;
  }

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <header className="bg-white border-b">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link
          to="/dashboard"
          className="text-lg font-bold text-gray-900 hover:text-gray-700 transition-colors"
        >
          Remittance System
        </Link>

        {token && (
          <button
            onClick={logout}
            className="bg-gray-900 text-white px-4 py-2 rounded-md
                       hover:bg-black transition-colors"
          >
            Logout
          </button>
        )}
      </div>
    </header>
  );
}
