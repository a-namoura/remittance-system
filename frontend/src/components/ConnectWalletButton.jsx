import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  linkWalletToUser,
  unlinkWalletFromUser,
} from "../services/walletApi.js";
import { getAuthToken } from "../services/session.js";

import { getUserErrorMessage } from "../utils/userError.js";
export default function ConnectWalletButton({
  connected,
  onLinked,
  onDisconnected,
}) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (!accounts || accounts.length === 0) {
        if (typeof onDisconnected === "function") {
          onDisconnected();
        }
        setStatus("");
        return;
      }

      if (connected) {
        if (typeof onDisconnected === "function") {
          onDisconnected();
        }
        setStatus("Wallet account changed. Please link again.");
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [connected, onDisconnected]);

  async function handleConnectAndVerify() {
    try {
      setError("");
      setStatus("");
      setLoading(true);

      const token = getAuthToken();
      if (!token) {
        throw new Error("You must be logged in to link a wallet.");
      }

      if (!window.ethereum) {
        throw new Error("No Ethereum wallet detected. Please install MetaMask.");
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        throw new Error("No account returned from wallet.");
      }

      const normalizedAddress = ethers.getAddress(accounts[0]);
      const signer = await provider.getSigner();
      const message = [
        "Wallet link request",
        `Host: ${window.location.host}`,
        `Timestamp: ${new Date().toISOString()}`,
      ].join("\n");
      const signature = await signer.signMessage(message);

      const res = await linkWalletToUser({
        token,
        address: normalizedAddress,
        message,
        signature,
      });

      setStatus(res.message || "Wallet linked and verified.");
      if (typeof onLinked === "function") {
        onLinked(normalizedAddress);
      }
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to connect wallet."));
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlink() {
    try {
      setError("");
      setStatus("");
      setLoading(true);

      const token = getAuthToken();
      if (!token) {
        throw new Error("You must be logged in to unlink a wallet.");
      }

      await unlinkWalletFromUser({ token });
      setStatus("Wallet unlinked from this account.");

      if (typeof onDisconnected === "function") {
        onDisconnected();
      }
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to unlink wallet."));
    } finally {
      setLoading(false);
    }
  }

  const label = loading
    ? "Working..."
    : connected
      ? "Connected"
      : "Connect & Verify Wallet";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleConnectAndVerify}
          disabled={loading || connected}
          className={`
            inline-flex items-center justify-center
            px-4 py-2 rounded-md text-sm font-semibold
            transition-all
            ${
              connected
                ? "bg-green-600 text-white hover:bg-green-600 cursor-default"
                : "bg-gray-900 text-white hover:bg-gray-800 active:scale-95"
            }
            disabled:opacity-60 disabled:active:scale-100
          `}
        >
          {label}
        </button>

        {connected && (
          <button
            type="button"
            onClick={handleUnlink}
            disabled={loading}
            className="inline-flex items-center justify-center px-3 py-2 rounded-md text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Unlink wallet
          </button>
        )}
      </div>

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
