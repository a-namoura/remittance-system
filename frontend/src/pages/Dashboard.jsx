import { useEffect, useState } from "react";
import { apiRequest } from "../services/api.js";
import ConnectWalletButton from "../components/ConnectWalletButton.jsx";

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    apiRequest("/api/me", { token })
      .then((data) => setMe(data.user))
      .catch((err) => setError(err.message));
  }, []);

  if (!me && !error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10 text-gray-600">
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Manage your wallet and track remittances.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-100 text-red-700">
          {error}
        </div>
      )}

      {/* Top grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile */}
        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Profile</h2>
              <p className="text-xs text-gray-500 mt-1">
                Account information
              </p>
            </div>

            <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">
              {me.role === "admin" ? "Admin" : "Customer"}
            </span>
          </div>

          <div className="mt-4">
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Quick Actions
          </h2>

          <div className="space-y-3">
            <button
              disabled
              className="w-full py-2 rounded-md bg-blue-600 text-white font-semibold
                         hover:bg-blue-700 transition-colors disabled:opacity-80"
            >
              Send Money (coming soon)
            </button>

            <button
              disabled
              className="w-full py-2 rounded-md bg-gray-100 text-gray-900 font-semibold
                         hover:bg-gray-200 transition-colors"
            >
              Track Transfer (coming soon)
            </button>

            <button
              disabled
              className="w-full py-2 rounded-md bg-gray-100 text-gray-900 font-semibold
                         hover:bg-gray-200 transition-colors"
            >
              Add Beneficiary (coming soon)
            </button>
          </div>
        </div>
      </div>

      {/* Wallet */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Wallet</h2>
            <p className="text-xs text-gray-500 mt-1">
              Connect and verify ownership to enable remittances.
            </p>
          </div>

          <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">
            Not linked
          </span>
        </div>

        <div className="mt-4">
          <ConnectWalletButton />
        </div>
      </div>

      {/* Activity */}
      <div className="rounded-2xl border bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">
          Recent Activity
        </h2>
        <p className="text-sm text-gray-600">
          No transactions yet. Once you send a remittance, it will appear here.
        </p>
      </div>
    </div>
  );
}
