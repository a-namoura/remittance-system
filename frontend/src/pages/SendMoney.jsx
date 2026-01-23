import { useState } from "react";
import { apiRequest } from "../services/api.js";
import { useNavigate } from "react-router-dom";
import BackButton from "../components/BackButton.jsx";

export default function SendMoney() {
  const navigate = useNavigate();

  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState(1); // 1 = form, 2 = confirm
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!receiver || !amount) {
      setError("Receiver and amount are required.");
      return;
    }

    setStep(2);
  }

  async function confirmSend() {
    setLoading(true);
    setError("");
    setSuccess("");

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
      setStep(1); // go back to form on error
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      {/* Back Button */}
      <div className="mb-6">
        <BackButton fallback="/dashboard" />
      </div>
      <h1 className="text-2xl font-bold mb-1">Send Money</h1>
      <p className="text-sm text-gray-600 mb-6">
        Send crypto remittance to another wallet address or a registered user (by email).
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

      {step === 1 && (
        <form
          onSubmit={onSubmit}
          className="space-y-4 bg-white border rounded-xl p-6"
        >
          <div>
            <label className="block text-sm font-medium mb-1">
              Recipient (wallet address or email)
            </label>
            <input
              className="w-full border rounded-md p-2 font-mono text-sm"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              placeholder="0x1234... or user@example.com"
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
            className="
              w-full bg-blue-600 text-white py-2 rounded-md font-semibold
              hover:bg-blue-700 active:scale-95 transition
              disabled:opacity-60
            "
            type="submit"
          >
            Continue
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="bg-white border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Confirm Transfer</h2>

          <div className="text-sm text-gray-700 space-y-1">
            <div>
              <span className="font-medium">Recipient:</span>{" "}
              <span className="font-mono">{receiver}</span>
            </div>
            <div>
              <span className="font-medium">Amount:</span>{" "}
              <span>{amount} ETH</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 border border-gray-300 text-gray-800 py-2 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSend}
              disabled={loading}
              className="
                flex-1 bg-blue-600 text-white py-2 rounded-md font-semibold
                hover:bg-blue-700 active:scale-95 transition
                disabled:opacity-60
              "
            >
              {loading ? "Sending..." : "Confirm & Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
