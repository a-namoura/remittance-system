import crypto from "crypto";

export const IN_FLIGHT_TRANSACTION_STATUSES = ["pending"];

export const DUPLICATE_TRANSFER_REQUEST_MESSAGE =
  "An identical transfer is already processing. Wait until the current transfer is completed or cancelled before submitting it again.";

const MAX_FAILURE_REASON_LENGTH = 1000;

function stablePart(value) {
  return String(value ?? "").trim();
}

function normalizeFailureText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FAILURE_REASON_LENGTH);
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

export function getTransactionFailureReason(err) {
  return (
    normalizeFailureText(err?.shortMessage) ||
    normalizeFailureText(err?.reason) ||
    normalizeFailureText(err?.message) ||
    "Transaction failed."
  );
}

export function getTransactionFailureTxHash(err) {
  return (
    stablePart(err?.receipt?.hash) ||
    stablePart(err?.transaction?.hash) ||
    stablePart(err?.transactionHash) ||
    null
  );
}

export async function markTransactionFailed(txDoc, err) {
  if (!txDoc || txDoc.status === "success") return;

  const txHash = getTransactionFailureTxHash(err);
  txDoc.status = "failed";
  txDoc.failureReason = getTransactionFailureReason(err);
  if (txHash && !txDoc.txHash) {
    txDoc.txHash = txHash;
  }

  await txDoc.save().catch(() => {});
}
