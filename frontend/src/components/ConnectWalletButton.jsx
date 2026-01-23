import { useEffect, useState } from "react";
import { apiRequest } from "../services/api.js";
import { ethers } from "ethers";

export default function ConnectWalletButton({
  connected,
  onLinked,
  onDisconnected,
}) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Watch for wallet disconnect / account removal and notify parent
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (!accounts || accounts.length === 0) {
        if (typeof onDisconnected === "function") {
          onDisconnected();
        }
        setStatus("");
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [onDisconnected]);

  async function handleConnectAndVerify() {
    try {
      setError("");
      setStatus("");
      setLoading(true);

      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("You must be logged in to link a wallet.");
      }

      if (!window.ethereum) {
        throw new Error("No Ethereum wallet detected. Please install MetaMask.");
      }

      // 1) Request accounts
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        throw new Error("No account returned from wallet.");
      }

      const address = accounts[0];

      // 2) Verify ownership by signing a message
      const signer = await provider.getSigner();
      const message = `Link wallet to remittance account at ${new Date().toISOString()}`;
      const signature = await signer.signMessage(message);

      // 3) Call backend to link + verify
      const res = await apiRequest("/api/wallet/link", {
        method: "POST",
        token,
        body: {
          address,
          message,
          signature,
        },
      });

      setStatus(res.message || "Wallet linked and verified.");

      if (typeof onLinked === "function") {
        onLinked(address);
      }
    } catch (err) {
      setError(err.message || "Failed to connect wallet.");
    } finally {
      setLoading(false);
    }
  }

  const label = loading
    ? "Connecting & Verifying..."
    : connected
    ? "Connected"
    : "Connect & Verify Wallet";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleConnectAndVerify}
        disabled={loading || connected}
        className={`
          inline-flex items-center justify-center
          px-4 py-2 rounded-md text-sm font-semibold
          transition-all
          ${connected
            ? "bg-green-600 text-white hover:bg-green-600 cursor-default"
            : "bg-gray-900 text-white hover:bg-gray-800 active:scale-95"
          }
          disabled:opacity-60 disabled:active:scale-100
        `}
      >
        {label}
      </button>

      {status && !error && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded px-2 py-1">
          {status}
        </div>
      )}

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  );
}
