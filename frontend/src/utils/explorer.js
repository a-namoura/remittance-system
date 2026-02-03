const BASE_URL = import.meta.env.VITE_EXPLORER_BASE_URL || "";
export function getExplorerTxUrl(txHash) {
  if (!txHash || !BASE_URL) return null;
  const trimmedBase = BASE_URL.replace(/\/+$/, "");
  return `${trimmedBase}/tx/${txHash}`;
}
