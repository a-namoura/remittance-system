import crypto from "crypto";
import { refreshTransactionWalletBalances } from "./walletBalances.js";

export const IN_FLIGHT_TRANSACTION_STATUSES = ["pending"];

export const DUPLICATE_TRANSFER_REQUEST_MESSAGE =
  "An identical transfer is already processing. Wait until the current transfer is completed or cancelled before submitting it again.";

const DEFAULT_TRANSACTION_SYNC_TIMEOUT_MS = 2000;
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

function asDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function createTransactionSyncTimeoutError(receivedAt) {
  const timeoutMs = getTransactionSyncTimeoutMs();
  const err = new Error(
    `Transaction database synchronization exceeded ${timeoutMs}ms after blockchain execution result.`
  );
  err.statusCode = 500;
  err.isTransactionSyncError = true;
  err.blockchainResultReceivedAt = receivedAt;
  return err;
}

export function getTransactionSyncTimeoutMs() {
  const configuredValue = Number(process.env.TRANSACTION_SYNC_TIMEOUT_MS);
  if (!Number.isFinite(configuredValue) || configuredValue <= 0) {
    return DEFAULT_TRANSACTION_SYNC_TIMEOUT_MS;
  }

  return Math.floor(configuredValue);
}

function getBlockchainResultTxHash(result) {
  return (
    stablePart(result?.txHash) ||
    stablePart(result?.hash) ||
    stablePart(result?.receipt?.hash) ||
    null
  );
}

function didBlockchainExecutionSucceed(result) {
  const status = result?.status;
  return !(status === 0 || status === "0" || status === false);
}

async function saveTransactionWithinSyncWindow(txDoc, receivedAt) {
  const elapsedMs = Date.now() - receivedAt.getTime();
  const remainingMs = getTransactionSyncTimeoutMs() - elapsedMs;

  if (remainingMs <= 0) {
    throw createTransactionSyncTimeoutError(receivedAt);
  }

  let timeoutId;
  try {
    await Promise.race([
      txDoc.save(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(createTransactionSyncTimeoutError(receivedAt)),
          remainingMs
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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

export function isTransactionSyncError(err) {
  return Boolean(err?.isTransactionSyncError);
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

  const receivedAt = new Date();
  const txHash = getTransactionFailureTxHash(err);
  txDoc.status = "failed";
  txDoc.failureReason = getTransactionFailureReason(err);
  if (txHash && !txDoc.txHash) {
    txDoc.txHash = txHash;
  }
  txDoc.blockchainResultReceivedAt = receivedAt;
  txDoc.blockchainSyncedAt = new Date();

  await saveTransactionWithinSyncWindow(txDoc, receivedAt).catch(() => {});
}

export async function recordTransactionSubmission(txDoc, submission) {
  const txHash = stablePart(submission?.txHash);
  if (!txDoc || !txHash) return txDoc;

  txDoc.txHash = txHash;
  txDoc.blockchainSubmittedAt = asDate(submission?.submittedAt || new Date());
  txDoc.reconciliationMissCount = 0;
  txDoc.reconciliationError = undefined;
  await txDoc.save();
  return txDoc;
}

export async function syncTransactionWithBlockchainResult(
  txDoc,
  result,
  { receivedAt = new Date(), failureReason } = {}
) {
  if (!txDoc) return null;

  const resultReceivedAt = asDate(receivedAt);
  const txHash = getBlockchainResultTxHash(result);
  const blockNumber = Number(result?.blockNumber);
  const executionSucceeded = didBlockchainExecutionSucceed(result);

  txDoc.status = executionSucceeded ? "success" : "failed";
  if (txHash) {
    txDoc.txHash = txHash;
  }
  if (Number.isInteger(blockNumber) && blockNumber >= 0) {
    txDoc.blockNumber = blockNumber;
  }
  txDoc.failureReason = executionSucceeded
    ? undefined
    : normalizeFailureText(failureReason) || "Blockchain execution failed.";
  txDoc.blockchainResultReceivedAt = resultReceivedAt;
  txDoc.blockchainSyncedAt = new Date();
  txDoc.reconciliationMissCount = 0;
  txDoc.reconciliationError = undefined;

  await saveTransactionWithinSyncWindow(txDoc, resultReceivedAt);

  if (executionSucceeded) {
    await refreshTransactionWalletBalances(txDoc, {
      syncedAt: txDoc.blockchainSyncedAt || new Date(),
    }).catch(() => {});
  }

  if (!executionSucceeded) {
    const err = new Error(txDoc.failureReason);
    err.statusCode = 502;
    err.blockchainExecutionFailed = true;
    throw err;
  }

  return txDoc;
}
