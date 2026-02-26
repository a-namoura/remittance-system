import { useEffect, useState } from "react";
import ConnectWalletButton from "../components/ConnectWalletButton.jsx";
import { PageContainer, PageError, PageHeader } from "../components/PageLayout.jsx";
import { getCurrentUser } from "../services/authApi.js";
import { getWalletBalance } from "../services/transactionApi.js";
import {
  clearWalletState,
  requireAuthToken,
  readWalletState,
  writeWalletState,
} from "../services/session.js";

import { getUserErrorMessage } from "../utils/userError.js";
function badgeClass(ok) {
  return ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700";
}

function actionIconClasses(actionId) {
  if (actionId === "buy") return "bg-emerald-100 text-emerald-700";
  if (actionId === "sell") return "bg-rose-100 text-rose-700";
  if (actionId === "convert") return "bg-violet-100 text-violet-700";
  if (actionId === "deposit") return "bg-sky-100 text-sky-700";
  if (actionId === "withdraw") return "bg-amber-100 text-amber-700";
  return "bg-indigo-100 text-indigo-700";
}

function actionIcon(actionId) {
  if (actionId === "buy") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="8" strokeWidth="1.8" />
        <path d="M12 8v8M8 12h8" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (actionId === "sell") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="8" strokeWidth="1.8" />
        <path d="M8 12h8" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (actionId === "convert") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
        <path d="M6 8h10l-2.5-2.5M18 16H8l2.5 2.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (actionId === "deposit") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
        <path d="M12 5v10M8.5 8.5 12 5l3.5 3.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 19h14" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
      <path d="M12 19V9M8.5 15.5 12 19l3.5-3.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5h14" strokeWidth="1.8" strokeLinecap="round" />
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
      const token = requireAuthToken({
        onMissing: () => {
          if (!isCancelled) {
            setError("You must be logged in.");
            setLoading(false);
          }
        },
      });
      if (!token) {
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
        setError(getUserErrorMessage(err, "Failed to load account."));
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
        const token = requireAuthToken();
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
          setBalanceError(getUserErrorMessage(err, "Failed to load account balance."));
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
      <PageContainer className="text-sm text-gray-600">Loading account...</PageContainer>
    );
  }

  const balanceValue = Number(accountBalances[selectedCurrency]);
  const hasBalanceValue = Number.isFinite(balanceValue);

  return (
    <PageContainer stack>
      <PageHeader
        title="Account"
        description="Manage your linked account and view balance."
      />

      <PageError>{error}</PageError>

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
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${actionIconClasses(
                  action.id
                )}`}
              >
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
    </PageContainer>
  );
}
