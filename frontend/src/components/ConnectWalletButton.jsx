import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  linkWalletToUser,
  unlinkWalletFromUser,
} from "../services/walletApi.js";
import { requireAuthToken } from "../services/session.js";
import SuccessTransition from "./SuccessTransition.jsx";

import { getUserErrorMessage } from "../utils/userError.js";
import { useSuccessTransitionMessage } from "../utils/successTransition.js";

const WALLET_PROVIDER_MISSING_MESSAGE =
  "Wallet provider not found. Install or enable MetaMask, then try again.";
const WALLET_CONNECTION_REJECTED_MESSAGE =
  "Wallet connection request was rejected. Approve the connection in MetaMask to continue.";
const WALLET_OWNERSHIP_REJECTED_MESSAGE =
  "Wallet ownership verification was rejected. Sign the verification message in MetaMask to link this wallet.";
const WALLET_OWNERSHIP_FAILED_MESSAGE =
  "Wallet ownership verification failed. The signed message could not be verified.";

function getMetaMaskProvider() {
  if (typeof window === "undefined") return null;
  const ethereum = window.ethereum;
  if (!ethereum) return null;
  if (ethereum.isMetaMask) return ethereum;
  if (Array.isArray(ethereum.providers)) {
    return ethereum.providers.find((provider) => provider?.isMetaMask) || null;
  }
  return null;
}

function getNestedWalletErrorCode(error) {
  return (
    error?.code ??
    error?.error?.code ??
    error?.data?.code ??
    error?.info?.error?.code ??
    ""
  );
}

function isWalletRequestRejected(error) {
  const code = String(getNestedWalletErrorCode(error)).trim().toUpperCase();
  if (code === "4001" || code === "ACTION_REJECTED") return true;

  const message = [
    error?.message,
    error?.shortMessage,
    error?.reason,
    error?.error?.message,
    error?.info?.error?.message,
  ]
    .filter(Boolean)
    .join(" ");

  return /user denied|user rejected|rejected the request|request rejected|action_rejected/i.test(
    message
  );
}

function isWalletOwnershipVerificationFailure(error) {
  const message = [error?.message, error?.data?.message]
    .filter(Boolean)
    .join(" ");

  return /wallet ownership verification|signature|signed message/i.test(message);
}

function formatWalletVerificationError(error) {
  const message = getUserErrorMessage(error, WALLET_OWNERSHIP_FAILED_MESSAGE);

  if (!isWalletOwnershipVerificationFailure(error)) {
    return message;
  }

  if (/^wallet ownership verification failed\./i.test(message)) {
    return message;
  }

  return `Wallet ownership verification failed. ${message}`;
}

export default function ConnectWalletButton({
  connected,
  onLinked,
  onDisconnected,
}) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [walletSuccessMessage, showWalletSuccess] =
    useSuccessTransitionMessage();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ethereum = getMetaMaskProvider();
    if (!ethereum?.on) return;

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

    ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      if (ethereum.removeListener) {
        ethereum.removeListener("accountsChanged", handleAccountsChanged);
      }
    };
  }, [connected, onDisconnected]);

  async function handleConnectAndVerify() {
    try {
      setError("");
      setStatus("");
      setLoading(true);

      const token = requireAuthToken();
      if (!token) {
        throw new Error("You must be logged in to link a wallet.");
      }

      const ethereum = getMetaMaskProvider();
      if (!ethereum) {
        throw new Error(WALLET_PROVIDER_MISSING_MESSAGE);
      }

      const provider = new ethers.BrowserProvider(ethereum);
      let accounts;
      try {
        accounts = await provider.send("eth_requestAccounts", []);
      } catch (err) {
        if (isWalletRequestRejected(err)) {
          throw new Error(WALLET_CONNECTION_REJECTED_MESSAGE);
        }
        throw new Error(getUserErrorMessage(err, "Wallet connection request failed."));
      }

      if (!accounts || accounts.length === 0) {
        throw new Error(
          "Wallet connection failed. No account was returned from the wallet."
        );
      }

      const normalizedAddress = ethers.getAddress(accounts[0]);
      const signer = await provider.getSigner();
      const message = [
        "Wallet link request",
        `Host: ${window.location.host}`,
        `Timestamp: ${new Date().toISOString()}`,
      ].join("\n");
      let signature;
      try {
        signature = await signer.signMessage(message);
      } catch (err) {
        if (isWalletRequestRejected(err)) {
          throw new Error(WALLET_OWNERSHIP_REJECTED_MESSAGE);
        }
        throw new Error(getUserErrorMessage(err, WALLET_OWNERSHIP_FAILED_MESSAGE));
      }

      let res;
      try {
        res = await linkWalletToUser({
          token,
          address: normalizedAddress,
          message,
          signature,
        });
      } catch (err) {
        throw new Error(formatWalletVerificationError(err));
      }

      const statusMessage =
        res.message || "Wallet successfully verified and linked to your account.";
      setStatus(statusMessage);
      showWalletSuccess("Wallet connected successfully");
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

      const token = requireAuthToken();
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
    <>
      <SuccessTransition message={walletSuccessMessage} />

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
    </>
  );
}
