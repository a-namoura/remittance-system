export const FALLBACK_NATIVE_CURRENCY = "BNB";

export function nativeCurrencyFrom(response, fallback = FALLBACK_NATIVE_CURRENCY) {
  return (
    String(response?.nativeCurrency || response?.currency || fallback)
      .trim()
      .toUpperCase() || FALLBACK_NATIVE_CURRENCY
  );
}

export function displayCurrency(value, fallback = FALLBACK_NATIVE_CURRENCY) {
  return String(value || fallback).trim().toUpperCase() || FALLBACK_NATIVE_CURRENCY;
}
