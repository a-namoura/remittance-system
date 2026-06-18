import { getAddress, isAddress, ZeroAddress } from "ethers";

export function normalizeEvmAddress(value) {
  const rawAddress = String(value || "").trim();
  if (!isAddress(rawAddress)) return "";

  const checksumAddress = getAddress(rawAddress);
  if (checksumAddress === ZeroAddress) return "";

  return checksumAddress.toLowerCase();
}

export function isValidEvmAddress(value) {
  return Boolean(normalizeEvmAddress(value));
}

export function formatWalletAddressForStorage(value) {
  return normalizeEvmAddress(value) || String(value || "").trim();
}

export function createInvalidWalletAddressMessage(fieldName = "address") {
  return `${fieldName} must be a valid EVM address.`;
}
