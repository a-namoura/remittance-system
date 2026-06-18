import { getAddress, isAddress, ZeroAddress } from "ethers";

export function normalizeEvmAddress(value) {
  const normalized = String(value || "").trim();
  if (!isAddress(normalized)) return "";

  const checksumAddress = getAddress(normalized);
  if (checksumAddress === ZeroAddress) return "";

  return checksumAddress.toLowerCase();
}

export function isValidEvmAddress(value) {
  return Boolean(normalizeEvmAddress(value));
}

export function sanitizeNumericInput(value, { maxDigits } = {}) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!Number.isInteger(maxDigits) || maxDigits <= 0) {
    return digits;
  }
  return digits.slice(0, maxDigits);
}

export function openExternalUrl(url) {
  const normalized = String(url || "").trim();
  if (!normalized) return;

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) return;
    window.open(parsed.toString(), "_blank", "noopener,noreferrer");
  } catch {
    // ignore invalid URLs
  }
}
