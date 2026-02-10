const BASE_URL = import.meta.env.VITE_EXPLORER_BASE_URL || "";
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

export function getExplorerTxUrl(txHash) {
  const normalizedHash = String(txHash || "").trim();
  if (!BASE_URL || !TX_HASH_REGEX.test(normalizedHash)) return null;

  const trimmedBase = BASE_URL.replace(/\/+$/, "");
  return `${trimmedBase}/tx/${encodeURIComponent(normalizedHash)}`;
}
