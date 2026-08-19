export const TRANSFER_AMOUNT_DECIMAL_PLACES = 4;

export function isAllowedAmountValue(
  value,
  decimalPlaces = TRANSFER_AMOUNT_DECIMAL_PLACES
) {
  const places = Number.isInteger(decimalPlaces) && decimalPlaces >= 0
    ? decimalPlaces
    : TRANSFER_AMOUNT_DECIMAL_PLACES;
  return new RegExp(`^\\d*(?:\\.\\d{0,${places}})?$`).test(String(value || ""));
}
