import { useMemo, useState } from "react";
import { connectWallet, signLinkMessage } from "../services/wallet";
import { linkWalletToUser } from "../services/walletApi";

function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function ConnectWalletButton({ onLinked }) {
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [isLinked, setIsLinked] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | linking
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const token = useMemo(() => localStorage.getItem("token"), []);

  const handleConnect = async () => {
    setError(null);
    setSuccess(null);
    setStatus("connecting");

    try {
      const { address, balance } = await connectWallet();
      setAddress(address);
      setBalance(balance);
      setStatus("connected");
    } catch (err) {
      console.error(err);
      if (err?.code === -32002) {
        setError(
          "MetaMask request already pending. Open MetaMask and approve/reject it, then try again."
        );
      } else {
        setError(err?.message || "Failed to connect wallet.");
      }
      setStatus("idle");
    }
  };

  const handleLink = async () => {
    setError(null);
    setSuccess(null);

    if (!token) {
      setError("Missing login token. Please login again.");
      return;
    }
    if (!address) {
      setError("Connect your wallet first.");
      return;
    }

    setStatus("linking");

    try {
      const message = `Link wallet to Remittance System\n\nTime: ${new Date().toISOString()}`;
      const { address: signedAddress, signature } = await signLinkMessage(message);

      if (signedAddress.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Wallet account changed. Please reconnect and try again.");
      }

      await linkWalletToUser({ token, address, signature, message });

      setIsLinked(true);
      setSuccess("Wallet verified and linked to your account.");
      onLinked?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to verify and link wallet.");
    } finally {
      setStatus("connected");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleConnect}
          disabled={status === "connecting" || status === "linking"}
          className="
            bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold
            hover:bg-blue-700 active:scale-95 transition-all
            disabled:opacity-60
          "
        >
          {status === "connecting"
            ? "Connecting..."
            : address
            ? "Reconnect Wallet"
            : "Connect Wallet"}
        </button>

        <button
          type="button"
          onClick={handleLink}
          disabled={!address || status === "connecting" || status === "linking" || isLinked}
          className="
            bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-semibold
            hover:bg-black active:scale-95 transition-all
            disabled:opacity-60
          "
        >
          {status === "linking" ? "Verifying..." : isLinked ? "Verified" : "Verify & Link"}
        </button>
      </div>

      {address && (
        <div className="text-sm text-gray-700 space-y-1">
          <div>
            <span className="font-medium">Address:</span>{" "}
            <span className="font-mono">{shortenAddress(address)}</span>
          </div>
          {balance != null && (
            <div>
              <span className="font-medium">Balance:</span>{" "}
              <span className="font-mono">{balance}</span>
            </div>
          )}
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}
      {success && <div className="text-sm text-green-700">{success}</div>}
    </div>
  );
}
