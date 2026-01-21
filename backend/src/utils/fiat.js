export function getUsdPerEthRate() {
  const raw = process.env.REM_RATE_USD_PER_ETH;

  if (!raw) {
    throw new Error("REM_RATE_USD_PER_ETH is not set in backend/.env");
  }

  const rate = Number(raw);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("REM_RATE_USD_PER_ETH must be a positive number.");
  }

  return rate;
}

export function convertEthToUsd(amountEth, rate) {
  const numericAmount = Number(amountEth);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw new Error("amountEth must be a non-negative number.");
  }

  const useRate = rate ?? getUsdPerEthRate();
  return numericAmount * useRate;
}
