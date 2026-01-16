import { useEffect, useState } from "react";
import { apiRequest } from "../services/api.js";
import ConnectWalletButton from "../components/ConnectWalletButton.jsx";

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("No token found. Please login.");
      return;
    }
    
    apiRequest("/api/me", { token })
    .then((data) => {
      console.log("ME response", data);
      setMe(data.user);
    })
    .catch((err) => setError(err.message));

  }, []);

  function logout() {
    localStorage.removeItem("token");
    location.href = "/login";
  }

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-700">{error}</div>}

      {me ? (
        <div className="space-y-2">
          <div><span className="font-medium">Email:</span> {me.email}</div>
          <div><span className="font-medium">Username:</span> {me.username || "-"}</div>
          <div><span className="font-medium">Role:</span> {me.role}</div>

          <button className="mt-4 bg-gray-900 text-white px-4 py-2 rounded" onClick={logout}>
            Logout
          </button>
          <ConnectWalletButton />
        </div>
      ) : !error ? (
        <div>Loading...</div>
      ) : null}
    </div>
  );
}
