import { apiRequest } from "./api.js";
import { ethers } from "ethers";

const FALLBACK_NATIVE_CURRENCY = "BNB";
const REMITTANCE_ABI = ["function transfer(address payable receiver) payable"];

function getInjectedWalletProvider() {
  const injected = globalThis?.window?.ethereum;
  if (!injected) return null;
  if (injected.isMetaMask) return injected;
  if (Array.isArray(injected.providers)) {
    return injected.providers.find((candidate) => candidate?.isMetaMask) || injected;
  }
  return injected;
}

function configuredChainId() {
  return BigInt(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_REM_CHAIN_ID || 97);
}

export async function submitConnectedWalletTransfer({ senderWallet, receiverWallet, amountEth }) {
  const walletProvider = getInjectedWalletProvider();
  if (!walletProvider?.request) throw new Error("Wallet provider not found. Connect MetaMask and try again.");

  const expectedChainId = configuredChainId();
  const currentChainId = BigInt(await walletProvider.request({ method: "eth_chainId" }));
  if (currentChainId !== expectedChainId) {
    try {
      await walletProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ethers.toBeHex(expectedChainId) }],
      });
    } catch (error) {
      if (String(error?.code) === "4001") {
        throw new Error("Network switch was cancelled in MetaMask.");
      }
      throw new Error(`Switch your wallet to chain ${expectedChainId.toString()} and try again.`);
    }
  }

  const accounts = await walletProvider.request({ method: "eth_requestAccounts" });
  const signerAddress = String(accounts?.[0] || "");
  if (signerAddress.toLowerCase() !== String(senderWallet || "").toLowerCase()) {
    throw new Error("The active wallet account does not match your linked wallet.");
  }

  const contractAddress = String(import.meta.env.VITE_REM_CONTRACT_ADDRESS || "").trim();
  if (!ethers.isAddress(contractAddress)) {
    throw new Error("The remittance contract is not configured in the frontend.");
  }
  const contractInterface = new ethers.Interface(REMITTANCE_ABI);
  return walletProvider.request({
    method: "eth_sendTransaction",
    params: [{
      from: signerAddress,
      to: contractAddress,
      value: ethers.toBeHex(ethers.parseEther(String(amountEth))),
      data: contractInterface.encodeFunctionData("transfer", [receiverWallet]),
    }],
  });
}

async function getInjectedNativeBalance(wallet) {
  const walletProvider = getInjectedWalletProvider();
  if (!walletProvider?.request) return null;

  const expectedChainId = Number(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_REM_CHAIN_ID || 97);
  const [chainIdHex, accounts] = await Promise.all([
    walletProvider.request({ method: "eth_chainId" }),
    walletProvider.request({ method: "eth_accounts" }),
  ]);

  if (Number.parseInt(String(chainIdHex), 16) !== expectedChainId) return null;
  const normalizedWallet = String(wallet).toLowerCase();
  if (!Array.isArray(accounts) || !accounts.some((account) => String(account).toLowerCase() === normalizedWallet)) {
    return null;
  }

  const balanceHex = await walletProvider.request({
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

export async function createPaymentRequestLink({ token, encryptedPayload, paymentCommitment, assetSymbol } = {}) {
  return apiRequest("/api/transactions/request-link", {
    method: "POST",
    token,
    body: { encryptedPayload, paymentCommitment, assetSymbol },
  });
}

export async function resolvePaymentRequestLink({ token, authToken } = {}) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) throw new Error("request token is required");
  return apiRequest("/api/transactions/request-link/resolve", {
    method: "POST",
    token: authToken,
    body: { token: normalizedToken },
  });
}

export async function revokePaymentRequestLink({ token, authToken } = {}) {
  return apiRequest("/api/transactions/request-link/revoke", {
    method: "POST",
    token: authToken,
    body: { token },
  });
}

export async function reservePaymentRequestLink({ token, authToken, commitmentKey, receiverWallet, amountEth, assetSymbol } = {}) {
  return apiRequest("/api/transactions/request-link/reserve", {
    method: "POST", token: authToken, body: { token, commitmentKey, receiverWallet, amountEth, assetSymbol },
  });
}

export async function releasePaymentRequestLink({ token, authToken } = {}) {
  return apiRequest("/api/transactions/request-link/release", {
    method: "POST", token: authToken, body: { token },
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
  txHash,
  requestToken,
  commitmentKey,
} = {}) {
  return apiRequest("/api/transactions/send", {
    method: "POST",
    token,
    body: {
      receiverWallet,
      amountEth,
      verificationCode,
      assetSymbol,
      txHash,
      requestToken,
      commitmentKey,
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
    if (["success", "failed", "cancelled"].includes(status)) {
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
