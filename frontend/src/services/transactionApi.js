import { apiRequest } from "./api.js";

const FALLBACK_NATIVE_CURRENCY = "BNB";

async function getInjectedNativeBalance(wallet) {
  const ethereum = globalThis?.window?.ethereum;
  if (!ethereum?.request) return null;

  const expectedChainId = Number(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_REM_CHAIN_ID || 97);
  const [chainIdHex, accounts] = await Promise.all([
    ethereum.request({ method: "eth_chainId" }),
    ethereum.request({ method: "eth_accounts" }),
  ]);

  if (Number.parseInt(String(chainIdHex), 16) !== expectedChainId) return null;
  const normalizedWallet = String(wallet).toLowerCase();
  if (!Array.isArray(accounts) || !accounts.some((account) => String(account).toLowerCase() === normalizedWallet)) {
    return null;
  }

  const balanceHex = await ethereum.request({
    method: "eth_getBalance",
    params: [wallet, "latest"],
  });
  const nativeBalance = Number(BigInt(balanceHex)) / 1e18;
  if (!Number.isFinite(nativeBalance)) return null;

  return {
    ok: true,
    wallet,
    balance: nativeBalance,
    currency: FALLBACK_NATIVE_CURRENCY,
    nativeBalance,
    nativeCurrency: FALLBACK_NATIVE_CURRENCY,
    balances: { [FALLBACK_NATIVE_CURRENCY]: nativeBalance },
    availableCurrencies: [FALLBACK_NATIVE_CURRENCY],
    source: "wallet",
  };
}

export async function createTransferLink({
  token,
  amountEth,
  note,
  assetSymbol,
} = {}) {
  return apiRequest("/api/transactions/link", {
    method: "POST",
    token,
    body: { amountEth, note, assetSymbol },
  });
}

export async function resolveTransferLink({ token } = {}) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw new Error("token is required");
  }

  const params = new URLSearchParams({ token: normalizedToken });
  return apiRequest(`/api/transactions/link/resolve?${params.toString()}`);
}

export async function claimTransferLink({ token, authToken } = {}) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw new Error("token is required");
  }

  return apiRequest("/api/transactions/link/claim", {
    method: "POST",
    token: authToken,
    body: { token: normalizedToken },
  });
}

export async function sendPaymentVerificationCode({
  token,
  verificationChannel,
} = {}) {
  return apiRequest("/api/transactions/send-code", {
    method: "POST",
    token,
    body: { verificationChannel },
  });
}

export async function sendTransaction({
  token,
  receiverWallet,
  amountEth,
  verificationCode,
  assetSymbol,
} = {}) {
  return apiRequest("/api/transactions/send", {
    method: "POST",
    token,
    body: {
      receiverWallet,
      amountEth,
      verificationCode,
      assetSymbol,
    },
  });
}

export async function getWalletBalance({
  token,
  wallet,
  currency,
  currencies,
} = {}) {
  const normalizedWallet = String(wallet || "").trim();
  if (!normalizedWallet) {
    throw new Error("wallet is required");
  }

  try {
    const liveBalance = await getInjectedNativeBalance(normalizedWallet);
    if (liveBalance) return liveBalance;
  } catch {
    // Fall back to the authenticated backend lookup when the injected wallet
    // is unavailable, locked, or on a different chain.
  }

  const params = new URLSearchParams({ wallet: normalizedWallet });

  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  if (normalizedCurrency) {
    params.set("currency", normalizedCurrency);
  }

  if (Array.isArray(currencies) && currencies.length > 0) {
    const normalizedCurrencies = currencies
      .map((value) => String(value || "").trim().toUpperCase())
      .filter(Boolean);
    if (normalizedCurrencies.length > 0) {
      params.set("currencies", normalizedCurrencies.join(","));
    }
  }

  return apiRequest(`/api/transactions/balance?${params.toString()}`, { token });
}

export async function getMyTransactions({
  token,
  limit = 10,
  page = 1,
  status,
  from,
  to,
  view,
}) {
  const params = new URLSearchParams();

  const numericLimit = Number(limit);
  const numericPage = Number(page);

  if (Number.isFinite(numericLimit) && numericLimit > 0) {
    params.set("limit", String(Math.floor(numericLimit)));
  }
  if (Number.isFinite(numericPage) && numericPage > 0) {
    params.set("page", String(Math.floor(numericPage)));
  }
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (view && view !== "all") params.set("view", view);

  const qs = params.toString();
  const path = qs ? `/api/transactions/my?${qs}` : "/api/transactions/my";

  return apiRequest(path, { token });
}

export async function getTransactionById({ token, id }) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("Transaction id is required");
  }

  const path = `/api/transactions/${encodeURIComponent(normalizedId)}`;
  return apiRequest(path, { token });
}

export async function cancelTransaction({ token, id }) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("Transaction id is required");

  return apiRequest(`/api/transactions/${encodeURIComponent(normalizedId)}/cancel`, {
    method: "POST",
    token,
  });
}

export async function pollTransactionUntilSettled({
  token,
  id,
  initialDelayMs = 1000,
  intervalMs = 1000,
  timeoutMs = 60000,
  signal,
  onUpdate,
} = {}) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("Transaction id is required");
  }

  const startedAt = Date.now();

  if (initialDelayMs > 0 && !signal?.aborted) {
    await new Promise((resolve) => {
      const timeoutId = window.setTimeout(resolve, initialDelayMs);
      signal?.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timeoutId);
          resolve();
        },
        { once: true }
      );
    });
  }

  while (!signal?.aborted) {
    const response = await getTransactionById({ token, id: normalizedId });
    const transaction = response?.transaction || null;
    if (typeof onUpdate === "function") {
      onUpdate(transaction);
    }

    const status = String(transaction?.status || "").trim().toLowerCase();
    if (["success", "failed", "cancelled", "reconciliation_required"].includes(status)) {
      return transaction;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      return transaction;
    }

    await new Promise((resolve) => {
      const timeoutId = window.setTimeout(resolve, intervalMs);
      signal?.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timeoutId);
          resolve();
        },
        { once: true }
      );
    });
  }

  return null;
}
