import { useState } from "react";
import { apiRequest } from "../services/api.js";
import { useNavigate } from "react-router-dom";

export default function SendMoney() {
  const navigate = useNavigate();

  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("You are not logged in.");

      await apiRequest("/api/transactions/send", {
        method: "POST",
        token,
        body: {
          receiver,
          amountEth: amount,
        },
      });

      setSuccess("Transfer submitted successfully.");
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Send Money</h1>
      <p className="text-sm text-gray-600 mb-6">
        Send crypto remittance to another wallet.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 rounded bg-green-100 text-green-700">
          {success}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 bg-white border rounded-xl p-6">
        <div>
          <label className="block text-sm font-medium mb-1">
            Receiver Wallet Address
          </label>
          <input
            className="w-full border rounded-md p-2 font-mono text-sm"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            placeholder="0x..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Amount (ETH)
          </label>
          <input
            className="w-full border rounded-md p-2"
            type="number"
            step="0.0001"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <button
          disabled={loading}
          className="
            w-full bg-blue-600 text-white py-2 rounded-md font-semibold
            hover:bg-blue-700 active:scale-95 transition
            disabled:opacity-60
          "
        >
          {loading ? "Sending..." : "Send Money"}
        </button>
      </form>
    </div>
  );
}
