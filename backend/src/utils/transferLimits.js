import { getNativeAssetSymbol } from "./currency.js";

const DEFAULT_ASSET_SYMBOL = getNativeAssetSymbol();

function readTransferLimit(name) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function formatLimit(value) {
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 18,
    useGrouping: false,
  });
}

export function rejectOutOfRangeTransferAmount(res, amount) {
  const normalizedAmount = Number(amount);
  const minTransferEth = readTransferLimit("MIN_TRANSFER_ETH");
  const maxTransferEth = readTransferLimit("MAX_TRANSFER_ETH");

  if (minTransferEth !== null && normalizedAmount < minTransferEth) {
    res.status(400);
    throw new Error(
      `amountEth must be at least ${formatLimit(minTransferEth)} ${DEFAULT_ASSET_SYMBOL}.`
    );
  }

  if (maxTransferEth !== null && normalizedAmount > maxTransferEth) {
    res.status(400);
    throw new Error(
      `amountEth must be at most ${formatLimit(maxTransferEth)} ${DEFAULT_ASSET_SYMBOL}.`
    );
  }
}
