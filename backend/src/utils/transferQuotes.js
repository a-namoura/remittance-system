import { getNativeAssetSymbol, getUsdRateBySymbol, normalizeCurrencySymbol } from "./currency.js";

const round = (value, places = 8) => Number(Number(value).toFixed(places));

export function calculateTransferQuote({ sourceAmount, sourceCurrency, destinationCurrency }) {
  const amount = Number(sourceAmount);
  const source = normalizeCurrencySymbol(sourceCurrency);
  const destination = normalizeCurrencySymbol(destinationCurrency);
  const native = getNativeAssetSymbol();
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error("sourceAmount must be a positive number."), { statusCode: 400 });
  if (source !== native) throw Object.assign(new Error(`sourceCurrency must be ${native}.`), { statusCode: 400 });
  const sourceUsdRate = getUsdRateBySymbol(source);
  const destinationUsdRate = getUsdRateBySymbol(destination);
  if (!destination || (source !== destination && (!Number.isFinite(sourceUsdRate) || !Number.isFinite(destinationUsdRate)))) {
    throw Object.assign(new Error("The requested currency pair is unavailable."), { statusCode: 400 });
  }
  const exchangeRate = source === destination ? 1 : sourceUsdRate / destinationUsdRate;
  const serviceFeeRate = Number(process.env.REM_SERVICE_FEE_RATE || 0.01);
  const networkFee = Number(process.env.REM_ESTIMATED_NETWORK_FEE || 0.0001);
  const serviceFee = round(amount * (Number.isFinite(serviceFeeRate) ? serviceFeeRate : 0.01));
  const estimatedNetworkFee = round(Number.isFinite(networkFee) && networkFee >= 0 ? networkFee : 0.0001);
  return {
    sourceAmount: round(amount), sourceCurrency: source, destinationCurrency: destination,
    exchangeRate: round(exchangeRate, 12), serviceFee, estimatedNetworkFee,
    recipientAmount: round(amount * exchangeRate),
  };
}

export function serializeTransferQuote(quote) {
  return {
    quoteId: String(quote._id), sourceAmount: quote.sourceAmount, sourceCurrency: quote.sourceCurrency,
    destinationCurrency: quote.destinationCurrency, exchangeRate: quote.exchangeRate,
    serviceFee: quote.serviceFee, estimatedNetworkFee: quote.estimatedNetworkFee,
    recipientAmount: quote.recipientAmount, expiresAt: quote.expiresAt,
  };
}
