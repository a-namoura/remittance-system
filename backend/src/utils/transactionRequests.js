import crypto from "crypto";

export const IN_FLIGHT_TRANSACTION_STATUSES = ["pending"];

export const DUPLICATE_TRANSFER_REQUEST_MESSAGE =
  "An identical transfer is already processing. Wait until the current transfer is completed or cancelled before submitting it again.";

function stablePart(value) {
  return String(value ?? "").trim();
}

export function createTransferRequestKey({
  senderUserId,
  senderWallet,
  receiverWallet,
  amount,
  assetSymbol,
} = {}) {
  const numericAmount = Number(amount);
  const amountKey = Number.isFinite(numericAmount)
    ? numericAmount.toString()
    : stablePart(amount);

  const payload = [
    stablePart(senderUserId),
    stablePart(senderWallet).toLowerCase(),
    stablePart(receiverWallet).toLowerCase(),
    amountKey,
    stablePart(assetSymbol).toUpperCase(),
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function isDuplicateTransferRequestKeyError(err) {
  if (err?.code !== 11000) return false;
  return Boolean(
    err?.keyPattern?.transferRequestKey || err?.keyValue?.transferRequestKey
  );
}
