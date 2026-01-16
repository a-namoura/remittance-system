import { useState } from "react";
import { connectWallet } from "../services/wallet";

function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function ConnectWalletButton() {
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [status, setStatus] = useState("disconnected");
  const [error, setError] = useState(null);

  const handleConnect = async () => {
    setError(null);
    setStatus("connecting");
    try {
      const { address, balance } = await connectWallet();
      setAddress(address);
      setBalance(balance);
      setStatus("connected");
      setError(null);
    } catch (err) {
        console.error(err);
        if (err?.code === -32002) {
            // MetaMask: request already pending
            setError(
                "A wallet connection request is already pending in MetaMask. Open the MetaMask extension and approve or reject it, then try again."
            );
        } else {
            setError(err?.message || "Failed to connect wallet.");
        }
        setStatus("disconnected");
    }
  };

  return (
    <div className="mt-6 space-y-2">
      <button
        type="button"
        onClick={handleConnect}
        disabled={status === "connecting"}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
      >
        {status === "connecting" ? "Connecting..." : "Connect Wallet"}
      </button>

      {address && (
        <div className="text-sm text-gray-700">
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
    </div>
  );
}
