const DEFAULT_NATIVE_ASSET_SYMBOL = String(process.env.REM_NATIVE_CURRENCY || "ETH")
  .trim()
  .toUpperCase();

function readPositiveNumber(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function envRateForSymbol(symbol) {
  const normalized = normalizeCurrencySymbol(symbol);
  if (!normalized) return null;
  return readPositiveNumber(process.env[`REM_RATE_USD_PER_${normalized}`]);
}

export function normalizeCurrencySymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

export function getNativeAssetSymbol() {
  return DEFAULT_NATIVE_ASSET_SYMBOL || "ETH";
}

export function getNativeUsdRate() {
  const nativeSymbol = getNativeAssetSymbol();
  return envRateForSymbol(nativeSymbol);
}

export function getUsdRateBySymbol(symbol) {
  const normalized = normalizeCurrencySymbol(symbol);
  if (!normalized) return null;

  if (normalized === "USDT" || normalized === "USDC") {
    return 1;
  }

  const directRate = envRateForSymbol(normalized);
  if (Number.isFinite(directRate) && directRate > 0) {
    return directRate;
  }

  if (normalized === getNativeAssetSymbol()) {
    return getNativeUsdRate();
  }

  return null;
}

export function getAvailableCurrencySymbols() {
  const nativeSymbol = getNativeAssetSymbol();
  const nativeUsdRate = getNativeUsdRate();
  const baseOrder = [nativeSymbol, "USDT", "BTC", "BNB"];
  const deduped = [...new Set(baseOrder.filter(Boolean))];

  return deduped.filter((symbol) => {
    if (symbol === nativeSymbol) return true;
    if (!Number.isFinite(nativeUsdRate) || nativeUsdRate <= 0) return false;
    const rate = getUsdRateBySymbol(symbol);
    return Number.isFinite(rate) && rate > 0;
  });
}

export function convertFromNativeCurrency(nativeAmount, targetSymbol) {
  const amount = Number(nativeAmount);
  if (!Number.isFinite(amount) || amount < 0) return null;

  const normalizedTarget = normalizeCurrencySymbol(targetSymbol);
  if (!normalizedTarget) return null;

  const nativeSymbol = getNativeAssetSymbol();
  if (normalizedTarget === nativeSymbol) {
    return amount;
  }

  const nativeUsdRate = getNativeUsdRate();
  const targetUsdRate = getUsdRateBySymbol(normalizedTarget);

  if (
    !Number.isFinite(nativeUsdRate) ||
    nativeUsdRate <= 0 ||
    !Number.isFinite(targetUsdRate) ||
    targetUsdRate <= 0
  ) {
    return null;
  }

  return (amount * nativeUsdRate) / targetUsdRate;
}

export function getBalancesForSymbols(nativeAmount, symbols = []) {
  const requestedSymbols = Array.isArray(symbols)
    ? symbols.map(normalizeCurrencySymbol).filter(Boolean)
    : [];
  const availableCurrencies = getAvailableCurrencySymbols();

  let selectedSymbols =
    requestedSymbols.length > 0
      ? requestedSymbols.filter((symbol) => availableCurrencies.includes(symbol))
      : [...availableCurrencies];

  const nativeSymbol = getNativeAssetSymbol();
  if (!selectedSymbols.includes(nativeSymbol)) {
    selectedSymbols = [nativeSymbol, ...selectedSymbols];
  }

  const balances = {};
  for (const symbol of selectedSymbols) {
    const converted = convertFromNativeCurrency(nativeAmount, symbol);
    if (Number.isFinite(converted)) {
      balances[symbol] = converted;
    }
  }

  return {
    nativeCurrency: nativeSymbol,
    availableCurrencies,
    balances,
  };
}
