export const FALLBACK_NATIVE_CURRENCY = "BNB";
export const LEGACY_NATIVE_CURRENCY = "E" + "TH";

export function nativeCurrencyFrom(response, fallback = FALLBACK_NATIVE_CURRENCY) {
  return (
    String(response?.nativeCurrency || response?.currency || fallback)
      .trim()
      .toUpperCase() || FALLBACK_NATIVE_CURRENCY
  );
}

export function displayCurrency(value, fallback = FALLBACK_NATIVE_CURRENCY) {
  const normalizedFallback =
    String(fallback || FALLBACK_NATIVE_CURRENCY).trim().toUpperCase() ||
    FALLBACK_NATIVE_CURRENCY;
  const normalized = String(value || normalizedFallback).trim().toUpperCase();

  // Older records used a generic EVM-native label. On BSC those amounts were
  // and remain BNB, so present them using the actual chain asset.
  if (normalized === LEGACY_NATIVE_CURRENCY && normalizedFallback === "BNB") return "BNB";
  return normalized || normalizedFallback;
}
