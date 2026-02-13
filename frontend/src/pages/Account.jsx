import { useEffect, useState } from "react";
import ConnectWalletButton from "../components/ConnectWalletButton.jsx";
import { getCurrentUser } from "../services/authApi.js";
import { getWalletBalance } from "../services/transactionApi.js";
import {
  clearWalletState,
  getAuthToken,
  readWalletState,
  writeWalletState,
} from "../services/session.js";

function badgeClass(ok) {
  return ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700";
}

function actionIcon(actionId) {
  if (actionId === "buy") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
        <path d="M12 4v16M5 12h14" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (actionId === "sell") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
        <path d="M5 12h14M12 5v14" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 16h8" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (actionId === "convert") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
        <path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (actionId === "deposit") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
        <path d="M12 4v12M8.5 8.5 12 5l3.5 3.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 20h14" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (actionId === "withdraw") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
        <path d="M12 20V8M8.5 15.5 12 19l3.5-3.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 4h14" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
      <rect x="4" y="6" width="7" height="5" rx="1" strokeWidth="1.8" />
      <rect x="13" y="13" width="7" height="5" rx="1" strokeWidth="1.8" />
      <path d="M11 8.5h2M12 8.5v5" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const QUICK_ACCOUNT_ACTIONS = [
  {
    id: "buy",
    label: "Buy",
    description: "Purchase assets directly into your linked account.",
  },
  {
    id: "sell",
    label: "Sell",
    description: "Sell assets and move value back to your account balance.",
  },
  {
    id: "convert",
    label: "Convert",
    description: "Switch between supported assets and currencies.",
  },
  {
    id: "deposit",
    label: "Deposit",
    description: "Top up your account from an external wallet or bank.",
  },
  {
    id: "withdraw",
    label: "Withdraw",
    description: "Move funds out of your account to a destination wallet.",
  },
  {
    id: "transfer_between_accounts",
    label: "Transfer between accounts",
    description: "Shift funds between your own linked accounts.",
  },
];

export default function Account() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [accountLinked, setAccountLinked] = useState(false);
  const [accountAddress, setAccountAddress] = useState("");
  const [accountBalances, setAccountBalances] = useState({});
  const [availableCurrencies, setAvailableCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const [balanceLoading, setBalanceLoading] = useState(false);
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
          setAccountBalances({});
          setAvailableCurrencies([]);
          setSelectedCurrency("");
          return;
        }

        if (user?.wallet?.linked && user?.wallet?.address) {
          setAccountLinked(true);
          setAccountAddress(user.wallet.address);
          writeWalletState(user.id, user.wallet.address);
          return;
        }

        const stored = readWalletState(user.id);
        setAccountLinked(stored.linked);
        setAccountAddress(stored.address);
        if (!stored.linked || !stored.address) {
          clearWalletState(user.id);
          setAccountBalances({});
          setAvailableCurrencies([]);
          setSelectedCurrency("");
        }
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
          setBalanceLoading(false);
          setAccountBalances({});
          setAvailableCurrencies([]);
          setSelectedCurrency("");
          setBalanceError("");
        }
        return;
      }

      try {
        const token = getAuthToken();
        if (!token) return;

        setBalanceLoading(true);
        setBalanceError("");
        const result = await getWalletBalance({
          token,
          wallet: accountAddress,
        });

        if (isCancelled) return;

        const balances =
          result?.balances && typeof result.balances === "object"
            ? result.balances
            : {};

        const currencies = Array.isArray(result?.availableCurrencies)
          ? result.availableCurrencies
              .map((value) => String(value || "").trim().toUpperCase())
              .filter(Boolean)
          : Object.keys(balances);

        const fallbackCurrency =
          String(result?.currency || result?.nativeCurrency || currencies[0] || "ETH")
            .trim()
            .toUpperCase();

        const nextCurrencies = currencies.length > 0 ? currencies : [fallbackCurrency];
        const nextSelectedCurrency = nextCurrencies.includes(selectedCurrency)
          ? selectedCurrency
          : fallbackCurrency;

        const nextBalance = Number(balances[nextSelectedCurrency]);

        if (!Number.isFinite(nextBalance)) {
          setAccountBalances({});
          setAvailableCurrencies(nextCurrencies);
          setSelectedCurrency(nextSelectedCurrency);
          setBalanceError("Failed to load account balance.");
          return;
        }

        setAccountBalances(balances);
        setAvailableCurrencies(nextCurrencies);
        setSelectedCurrency(nextSelectedCurrency);
      } catch (err) {
        if (!isCancelled) {
          setBalanceError(err.message || "Failed to load account balance.");
          setAccountBalances({});
          setAvailableCurrencies([]);
          setSelectedCurrency("");
        }
      } finally {
        if (!isCancelled) {
          setBalanceLoading(false);
        }
      }
    }

    fetchBalance();

    return () => {
      isCancelled = true;
    };
  }, [accountLinked, accountAddress]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 text-sm text-gray-600">
        Loading account...
      </div>
    );
  }

  const balanceValue = Number(accountBalances[selectedCurrency]);
  const hasBalanceValue = Number.isFinite(balanceValue);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Account</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your linked account and view balance.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Account Status
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Your blockchain wallet is used as your account.
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
              <div className="flex items-center gap-2">
                <span>Currency:</span>
                <select
                  value={selectedCurrency}
                  onChange={(event) =>
                    setSelectedCurrency(String(event.target.value || "").toUpperCase())
                  }
                  className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {availableCurrencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                Balance:{" "}
                {balanceLoading
                  ? "Loading..."
                  : hasBalanceValue
                    ? `${balanceValue.toFixed(4)} ${selectedCurrency}`
                    : "-"}
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
              setAccountBalances({});
              setAvailableCurrencies([]);
              setSelectedCurrency("");
              if (me?.id) {
                writeWalletState(me.id, address);
              }
            }}
            onDisconnected={() => {
              setAccountLinked(false);
              setAccountAddress("");
              setAccountBalances({});
              setAvailableCurrencies([]);
              setSelectedCurrency("");
              if (me?.id) {
                clearWalletState(me.id);
              }
            }}
          />
        </div>

        {QUICK_ACCOUNT_ACTIONS.map((action) => (
          <article
            key={action.id}
            className="cursor-not-allowed rounded-2xl border bg-white p-6 opacity-90"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-semibold text-gray-900">{action.label}</h3>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                {actionIcon(action.id)}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">{action.description}</p>
            <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              Coming soon
            </span>
          </article>
        ))}
      </section>
    </div>
  );
}
