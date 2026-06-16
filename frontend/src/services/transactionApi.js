import { apiRequest } from "./api.js";

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
