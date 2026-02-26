const TOKEN_STORAGE_KEY = "token";
const WALLET_CONNECTED_PREFIX = "walletConnected_";
const WALLET_ADDRESS_PREFIX = "walletAddress_";
const LEGACY_WALLET_ADDRESS_KEY = "walletAddress";

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeGetItem(key) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // ignore storage write failures
  }
}

function safeRemoveItem(key) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore storage remove failures
  }
}

export function getAuthToken() {
  const token = safeGetItem(TOKEN_STORAGE_KEY);
  if (!token) return null;

  const normalized = String(token).trim();
  return normalized || null;
}

export function requireAuthToken({
  onMissing = null,
  message = "You must be logged in.",
} = {}) {
  const token = getAuthToken();
  if (token) return token;

  if (typeof onMissing === "function") {
    onMissing(String(message || "You must be logged in."));
  }
  return null;
}

export function setAuthToken(token) {
  const normalized = String(token || "").trim();
  if (!normalized) {
    clearAuthToken();
    return;
  }
  safeSetItem(TOKEN_STORAGE_KEY, normalized);
}

export function clearAuthToken() {
  safeRemoveItem(TOKEN_STORAGE_KEY);
}

export function getWalletStorageKeys(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;

  return {
    connected: `${WALLET_CONNECTED_PREFIX}${normalizedUserId}`,
    address: `${WALLET_ADDRESS_PREFIX}${normalizedUserId}`,
  };
}

export function readWalletState(userId) {
  const keys = getWalletStorageKeys(userId);
  if (!keys) {
    return { linked: false, address: "" };
  }

  return {
    linked: safeGetItem(keys.connected) === "1",
    address: safeGetItem(keys.address) || "",
  };
}

export function writeWalletState(userId, address) {
  const keys = getWalletStorageKeys(userId);
  if (!keys) return;

  const normalizedAddress = String(address || "").trim();
  safeSetItem(keys.connected, "1");
  safeSetItem(keys.address, normalizedAddress);
}

export function clearWalletState(userId) {
  const keys = getWalletStorageKeys(userId);
  if (!keys) return;

  safeRemoveItem(keys.connected);
  safeRemoveItem(keys.address);
}

export function getLegacyWalletAddress() {
  return safeGetItem(LEGACY_WALLET_ADDRESS_KEY) || "";
}

export function clearLegacyWalletAddress() {
  safeRemoveItem(LEGACY_WALLET_ADDRESS_KEY);
}

export function clearSessionStorage() {
  clearAuthToken();
  clearLegacyWalletAddress();
}
