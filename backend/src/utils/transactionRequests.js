import crypto from "crypto";
import { refreshTransactionWalletBalances } from "./walletBalances.js";
import { logAudit } from "./audit.js";

export const IN_FLIGHT_TRANSACTION_STATUSES = ["pending"];
export const TERMINAL_TRANSACTION_STATUSES = ["success", "failed", "cancelled"];

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
  if (!txDoc || TERMINAL_TRANSACTION_STATUSES.includes(txDoc.status)) return;

  const receivedAt = new Date();
  const txHash = getTransactionFailureTxHash(err);
  const cancelled = isTransactionCancellation(err);
  txDoc.status = cancelled ? "cancelled" : "failed";
  txDoc.failureReason = cancelled
    ? "Transaction cancelled in the wallet."
    : getTransactionFailureReason(err);
  if (txHash && !txDoc.txHash) {
    txDoc.txHash = txHash;
  }
  txDoc.blockchainResultReceivedAt = receivedAt;
  txDoc.blockchainSyncedAt = new Date();

  await saveTransactionWithinSyncWindow(txDoc, receivedAt);
}

function isTransactionCancellation(err) {
  const code = String(err?.code || err?.error?.code || "").toLowerCase();
  return code === "4001" || code === "action_rejected" || code === "user_rejected";
}

export async function markTransactionFailedAndLogSyncError(txDoc, err) {
  try {
    await markTransactionFailed(txDoc, err);
    return null;
  } catch (syncErr) {
    if (isTransactionSyncError(syncErr)) {
      console.error("Transaction failure sync failed:", syncErr.message);
      void logAudit({ action: "TRANSACTION_SYNC_FAILED", metadata: { transactionId: String(txDoc?._id || ""), syncTarget: "transaction_failure", error: syncErr?.message || syncErr } });
    } else {
      console.error(
        "Transaction failure save failed:",
        syncErr?.message || syncErr
      );
    }
    return syncErr;
  }
}

function isTemporaryBlockchainInfrastructureError(err) {
  const code = String(
    err?.code || err?.error?.code || err?.info?.error?.code || ""
  ).toUpperCase();
  const message = String(
    err?.shortMessage || err?.reason || err?.message || ""
  ).toLowerCase();

  return (
    ["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(code) ||
    /^-32\d{3}$/.test(code) ||
    /\b(rpc|network|socket|connection|timeout|temporar|rate limit|503|504)\b/.test(message)
  );
}

// A confirmation waiter runs only after the transaction was broadcast.  An
// unavailable RPC endpoint is therefore evidence we need to retry, never
// evidence that the chain execution failed.
export async function preserveTransactionForRecovery(txDoc, err) {
  if (!txDoc) return;

  txDoc.reconciliationError = getTransactionFailureReason(err);
  txDoc.lastReconciledAt = new Date();
  await txDoc.save();
}

export async function recordTransactionSubmission(txDoc, submission) {
  const txHash = stablePart(submission?.txHash);
  if (!txDoc || !txHash) return txDoc;

  txDoc.txHash = txHash;
  txDoc.onChainSenderWallet = stablePart(submission?.from) || txDoc.onChainSenderWallet;
  txDoc.blockchainSubmittedAt = asDate(submission?.submittedAt || new Date());
  txDoc.reconciliationMissCount = 0;
  txDoc.reconciliationError = undefined;
  try {
    await txDoc.save();
  } catch (err) {
    // A broadcast is irreversible. Preserve every field needed to reconcile it
    // with the chain using a fresh database operation before surfacing the
    // persistence error; callers must never broadcast the transfer again.
    const recovery = {
      txHash: txDoc.txHash,
      senderWallet: txDoc.senderWallet,
      onChainSenderWallet: txDoc.onChainSenderWallet,
      receiverWallet: txDoc.receiverWallet,
      amount: txDoc.amount,
      assetSymbol: txDoc.assetSymbol,
      status: txDoc.status || "pending",
      blockchainSubmittedAt: txDoc.blockchainSubmittedAt,
      reconciliationMissCount: 0,
      reconciliationError: undefined,
    };
    try {
      await txDoc.constructor.updateOne({ _id: txDoc._id }, { $set: recovery });
    } catch (recoveryErr) {
      err.recoveryError = recoveryErr;
    }
    throw err;
  }
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

async function runSettlementCallback(callback, payload, label) {
  if (typeof callback !== "function") return;

  try {
    await callback(payload);
  } catch (err) {
    console.error(`Transaction settlement ${label} callback failed:`, err.message);
  }
}

export function settleTransactionAfterSubmission({
  txDoc,
  submission,
  onSuccess,
  onFailure,
} = {}) {
  if (!txDoc || typeof submission?.waitForConfirmation !== "function") {
    return;
  }

  void (async () => {
    try {
      const result = await submission.waitForConfirmation();
      await syncTransactionWithBlockchainResult(txDoc, result);
      await runSettlementCallback(onSuccess, { txDoc, result }, "success");
    } catch (err) {
      if (isTransactionSyncError(err)) {
        console.error("Transaction confirmation sync failed:", err.message);
        void logAudit({ action: "TRANSACTION_SYNC_FAILED", metadata: { transactionId: String(txDoc?._id || ""), syncTarget: "confirmation", error: err?.message || err } });
      } else if (isTemporaryBlockchainInfrastructureError(err)) {
        try {
          await preserveTransactionForRecovery(txDoc, err);
        } catch (recoveryErr) {
          console.error("Transaction recovery save failed:", recoveryErr.message);
        }
      } else {
        await markTransactionFailedAndLogSyncError(txDoc, err);
      }

      await runSettlementCallback(onFailure, { txDoc, error: err }, "failure");
    }
  })();
}
