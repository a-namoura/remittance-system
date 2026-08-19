import {
  isAllowedAmountValue,
  TRANSFER_AMOUNT_DECIMAL_PLACES,
} from "../utils/amount.js";

export default function AmountInput({
  value,
  onValueChange,
  decimalPlaces = TRANSFER_AMOUNT_DECIMAL_PLACES,
  ...inputProps
}) {
  function handleChange(event) {
    const nextValue = String(event.target.value || "").replace(",", ".");
    if (isAllowedAmountValue(nextValue, decimalPlaces)) {
      onValueChange(nextValue);
    }
  }

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={handleChange}
    />
  );
}
