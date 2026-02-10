import { useEffect, useState } from "react";
import { ethers } from "ethers";
import ConnectWalletButton from "../components/ConnectWalletButton.jsx";
import { getCurrentUser } from "../services/authApi.js";
import {
  clearWalletState,
  getAuthToken,
  readWalletState,
  writeWalletState,
} from "../services/session.js";

function badgeClass(ok) {
  return ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700";
}

export default function Account() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [accountLinked, setAccountLinked] = useState(false);
  const [accountAddress, setAccountAddress] = useState("");
  const [accountBalance, setAccountBalance] = useState(null);
  const [balanceError, setBalanceError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadAccount() {
      const token = getAuthToken();
      if (!token) {
        if (!isCancelled) {
          setError("You must be logged in.");
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError("");

        const user = await getCurrentUser({ token });
        if (isCancelled) return;

        setMe(user);
        if (!user?.id) {
          setAccountLinked(false);
          setAccountAddress("");
          return;
        }

        const stored = readWalletState(user.id);
        setAccountLinked(stored.linked);
        setAccountAddress(stored.address);
      } catch (err) {
        if (isCancelled) return;
        setError(err.message || "Failed to load account.");
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadAccount();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function fetchBalance() {
      if (!accountLinked || !accountAddress) {
        if (!isCancelled) {
          setAccountBalance(null);
          setBalanceError("");
        }
        return;
      }

      if (!window.ethereum) {
        if (!isCancelled) {
          setBalanceError("Wallet provider not available to fetch balance.");
        }
        return;
      }

      try {
        setBalanceError("");
        const provider = new ethers.BrowserProvider(window.ethereum);
        const balanceBigInt = await provider.getBalance(accountAddress);
        if (isCancelled) return;
        setAccountBalance(Number(ethers.formatEther(balanceBigInt)));
      } catch {
        if (!isCancelled) {
          setBalanceError("Failed to load account balance.");
          setAccountBalance(null);
        }
      }
    }

    fetchBalance();

    return () => {
      isCancelled = true;
    };
  }, [accountLinked, accountAddress]);

  function handleAddMoney(type) {
    if (type === "cash") {
      setInfo(
        "Cash top-up details will be added next. You can continue using transfers in the meantime."
      );
      return;
    }

    setInfo(
      "Crypto top-up details will be added next. Link your account to prepare for deposits."
    );
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 text-sm text-gray-600">
        Loading account...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Account</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your linked account, view balance, and add money.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {info && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {info}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Account Status
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Your blockchain wallet is used as your remittance account.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClass(
              accountLinked
            )}`}
          >
            {accountLinked ? "Linked" : "Not linked"}
          </span>
        </div>

        {accountLinked && accountAddress ? (
          <div className="space-y-1 text-xs text-gray-600">
            <div className="font-mono break-all">Address: {accountAddress}</div>
            <div>
              Balance:{" "}
              {accountBalance == null
                ? "Loading..."
                : `${accountBalance.toFixed(4)} ETH`}
            </div>
            {balanceError && <div className="text-red-600">{balanceError}</div>}
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Link your account to enable crypto transfers and top-ups.
          </p>
        )}

        <ConnectWalletButton
          connected={accountLinked}
          onLinked={(address) => {
            setAccountLinked(true);
            setAccountAddress(address);
            setAccountBalance(null);
            if (me?.id) {
              writeWalletState(me.id, address);
            }
          }}
          onDisconnected={() => {
            setAccountLinked(false);
            setAccountAddress("");
            setAccountBalance(null);
            if (me?.id) {
              clearWalletState(me.id);
            }
          }}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border bg-white p-6 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Add Cash</h3>
            <p className="mt-1 text-sm text-gray-600">
              Deposit cash through supported local channels.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleAddMoney("cash")}
            className="inline-flex rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
          >
            Add cash
          </button>
        </article>

        <article className="rounded-2xl border bg-white p-6 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Add Crypto
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Top up your account by depositing crypto to your linked address.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleAddMoney("crypto")}
            className="inline-flex rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Add crypto
          </button>
        </article>
      </section>
    </div>
  );
}
