const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function isValidEvmAddress(value) {
  const normalized = String(value || "").trim();
  return EVM_ADDRESS_REGEX.test(normalized);
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
