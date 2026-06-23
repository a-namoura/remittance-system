import { formatEther } from "ethers";
import {
  getRemittanceContractAddress,
  getRemittanceProvider,
  getRemittanceReadContract,
} from "./remittanceClient.js";
import { BlockchainSyncState } from "../models/BlockchainSyncState.js";
import { Transaction } from "../models/Transaction.js";
import { Wallet } from "../models/Wallet.js";
import { logAudit } from "../utils/audit.js";
import { getNativeAssetSymbol } from "../utils/currency.js";
import {
  isTransactionSyncError,
  syncTransactionWithBlockchainResult,
} from "../utils/transactionRequests.js";
import { refreshTransactionWalletBalances } from "../utils/walletBalances.js";

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_RECHECK_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MISS_THRESHOLD = 3;
const DEFAULT_PENDING_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_EVENT_CONFIRMATIONS = 3;
const DEFAULT_EVENT_BLOCK_BATCH_SIZE = 1000;
const DEFAULT_EVENT_INITIAL_LOOKBACK_BLOCKS = 5000;
const DEFAULT_EVENT_REORG_LOOKBACK_BLOCKS = 12;

let reconciliationTimer;
let reconciliationRunning = false;
let eventSyncWarningLogged = false;

function positiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeIntegerEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue == null || String(rawValue).trim() === "") return fallback;
  const value = Number(rawValue);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function reconciliationEnabled() {
  return String(process.env.TRANSACTION_RECONCILIATION_ENABLED || "true")
    .trim()
    .toLowerCase() !== "false";
}

function eventSyncEnabled() {
  return String(process.env.TRANSACTION_EVENT_SYNC_ENABLED || "true")
    .trim()
    .toLowerCase() !== "false";
}

function getConfig() {
  return {
    intervalMs: positiveIntegerEnv(
      "TRANSACTION_RECONCILIATION_INTERVAL_MS",
      DEFAULT_INTERVAL_MS
    ),
    batchSize: positiveIntegerEnv(
      "TRANSACTION_RECONCILIATION_BATCH_SIZE",
      DEFAULT_BATCH_SIZE
    ),
    recheckWindowMs: positiveIntegerEnv(
      "TRANSACTION_RECONCILIATION_RECHECK_MS",
      DEFAULT_RECHECK_WINDOW_MS
    ),
    missThreshold: positiveIntegerEnv(
      "TRANSACTION_RECONCILIATION_MISS_THRESHOLD",
      DEFAULT_MISS_THRESHOLD
    ),
    pendingTimeoutMs: positiveIntegerEnv(
      "TRANSACTION_PENDING_RECEIPT_TIMEOUT_MS",
      DEFAULT_PENDING_TIMEOUT_MS
    ),
    eventConfirmations: nonNegativeIntegerEnv(
      "TRANSACTION_EVENT_CONFIRMATIONS",
      DEFAULT_EVENT_CONFIRMATIONS
    ),
    eventBlockBatchSize: positiveIntegerEnv(
      "TRANSACTION_EVENT_BLOCK_BATCH_SIZE",
      DEFAULT_EVENT_BLOCK_BATCH_SIZE
    ),
    eventInitialLookbackBlocks: positiveIntegerEnv(
      "TRANSACTION_EVENT_INITIAL_LOOKBACK_BLOCKS",
      DEFAULT_EVENT_INITIAL_LOOKBACK_BLOCKS
    ),
    eventReorgLookbackBlocks: nonNegativeIntegerEnv(
      "TRANSACTION_EVENT_REORG_LOOKBACK_BLOCKS",
      DEFAULT_EVENT_REORG_LOOKBACK_BLOCKS
    ),
    eventSyncEnabled: eventSyncEnabled(),
    deploymentBlock: nonNegativeIntegerEnv(
      "REM_CONTRACT_DEPLOYMENT_BLOCK",
      null
    ),
  };
}

function normalizeError(err) {
  const nestedCode = err?.error?.code ?? err?.info?.error?.code;
  const nestedMessage = err?.error?.message || err?.info?.error?.message;
  const message = String(
    nestedMessage ||
      err?.shortMessage ||
      err?.reason ||
      err?.message ||
      err ||
      ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);

  return nestedCode == null ? message : `${nestedCode}: ${message}`;
}

function isRpcLogLimitError(err) {
  const code = err?.error?.code ?? err?.info?.error?.code ?? err?.code;
  const message = normalizeError(err).toLowerCase();
  return (
    code === -32005 ||
    message.includes("limit exceeded") ||
    message.includes("eth_getlogs")
  );
}

function receiptStatus(receipt) {
  return Number(receipt?.status) === 1 ? "success" : "failed";
}

function submittedAt(txDoc) {
  return txDoc.blockchainSubmittedAt || txDoc.createdAt || new Date();
}

async function auditCorrection(txDoc, previousStatus, reason) {
  await logAudit({
    userId: txDoc.senderUserId || null,
    action: "BLOCKCHAIN_RECONCILIATION_RESULT",
    metadata: {
      transactionId: String(txDoc._id),
      txHash: txDoc.txHash || null,
      previousStatus,
      reconciledStatus: txDoc.status,
      blockNumber: txDoc.blockNumber ?? null,
      reason,
    },
  });
}

async function saveReconciliationCheck(txDoc, checkedAt) {
  txDoc.lastReconciledAt = checkedAt;
  await txDoc.save();
}

async function handleMissingReceipt(txDoc, checkedAt, config) {
  const previousStatus = txDoc.status;
  const missCount = Number(txDoc.reconciliationMissCount || 0) + 1;
  const pendingAgeMs = checkedAt.getTime() - new Date(submittedAt(txDoc)).getTime();
  const terminalReceiptDisappeared = previousStatus === "success";
  const pendingReceiptExpired =
    previousStatus === "pending" && pendingAgeMs >= config.pendingTimeoutMs;

  txDoc.reconciliationMissCount = missCount;
  txDoc.lastReconciledAt = checkedAt;
  txDoc.reconciliationError = "Blockchain receipt was not found.";

  if (
    missCount >= config.missThreshold &&
    (terminalReceiptDisappeared || pendingReceiptExpired)
  ) {
    txDoc.status = "failed";
    txDoc.failureReason = terminalReceiptDisappeared
      ? "Confirmed blockchain receipt disappeared during reconciliation."
      : "Blockchain receipt was not found before the pending timeout.";
    txDoc.blockchainSyncedAt = checkedAt;
  }

  await txDoc.save();

  if (previousStatus !== txDoc.status) {
    await auditCorrection(txDoc, previousStatus, "receipt_missing");
    return true;
  }

  return false;
}

async function reconcileTransaction(txDoc, provider, config) {
  const checkedAt = new Date();
  let receipt;

  try {
    receipt = await provider.getTransactionReceipt(txDoc.txHash);
  } catch (err) {
    txDoc.reconciliationError = normalizeError(err) || "Receipt lookup failed.";
    await saveReconciliationCheck(txDoc, checkedAt).catch(() => {});
    return { corrected: false, error: true };
  }

  if (!receipt) {
    const corrected = await handleMissingReceipt(txDoc, checkedAt, config);
    return { corrected, missing: true };
  }

  const previousStatus = txDoc.status;
  const chainStatus = receiptStatus(receipt);
  const blockNumber = Number(receipt.blockNumber);
  const needsCorrection =
    previousStatus !== chainStatus ||
    txDoc.blockNumber !== blockNumber ||
    !txDoc.blockchainSyncedAt;

  if (needsCorrection) {
    try {
      await syncTransactionWithBlockchainResult(txDoc, {
        txHash: receipt.hash || txDoc.txHash,
        status: receipt.status,
        blockNumber,
      });
    } catch (err) {
      if (!err?.blockchainExecutionFailed && !isTransactionSyncError(err)) {
        throw err;
      }
      if (isTransactionSyncError(err)) {
        txDoc.reconciliationError = normalizeError(err);
        await saveReconciliationCheck(txDoc, checkedAt).catch(() => {});
        return { corrected: false, error: true };
      }
    }
  }

  txDoc.lastReconciledAt = checkedAt;
  txDoc.reconciliationMissCount = 0;
  txDoc.reconciliationError = undefined;
  await txDoc.save();

  if (needsCorrection) {
    await auditCorrection(txDoc, previousStatus, "receipt_status_sync");
  }

  return { corrected: needsCorrection };
}

function transferEventData(event) {
  const senderWallet = String(event?.args?.sender || "").trim();
  const receiverWallet = String(event?.args?.receiver || "").trim();
  const txHash = String(event?.transactionHash || "").trim();
  const amount = Number(formatEther(event?.args?.amount || 0n));
  const timestampSeconds = Number(event?.args?.timestamp || 0n);
  const logIndex = Number(event?.index ?? event?.logIndex);

  if (
    !senderWallet ||
    !receiverWallet ||
    !txHash ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return {
    senderWallet,
    receiverWallet,
    txHash,
    amount,
    blockNumber: Number(event.blockNumber),
    blockHash: String(event.blockHash || "").trim() || null,
    eventLogIndex:
      Number.isInteger(logIndex) && logIndex >= 0 ? logIndex : undefined,
    blockchainTimestamp:
      Number.isFinite(timestampSeconds) && timestampSeconds > 0
        ? new Date(timestampSeconds * 1000)
        : undefined,
  };
}

async function walletUserId(address) {
  const walletDoc = await Wallet.findOne({ address, isVerified: true })
    .select("userId")
    .lean();
  return walletDoc?.userId || undefined;
}

async function ingestTransferEvent(event) {
  const data = transferEventData(event);
  if (!data) return { ingested: false, invalid: true };

  const receivedAt = new Date();
  let txDoc = await Transaction.findOne({ txHash: data.txHash });

  if (txDoc) {
    const previousStatus = txDoc.status;
    txDoc.blockNumber = data.blockNumber;
    txDoc.blockHash = data.blockHash || undefined;
    txDoc.eventLogIndex = data.eventLogIndex;
    txDoc.blockchainTimestamp = data.blockchainTimestamp;
    txDoc.lastReconciledAt = receivedAt;

    await syncTransactionWithBlockchainResult(
      txDoc,
      {
        txHash: data.txHash,
        status: 1,
        blockNumber: data.blockNumber,
      },
      { receivedAt }
    );

    if (previousStatus !== txDoc.status) {
      await auditCorrection(txDoc, previousStatus, "transfer_event_sync");
    }

    return { ingested: false, updated: true };
  }

  const [senderUserId, receiverUserId] = await Promise.all([
    walletUserId(data.senderWallet),
    walletUserId(data.receiverWallet),
  ]);

  try {
    txDoc = await Transaction.create({
      senderUserId,
      receiverUserId,
      senderWallet: data.senderWallet,
      receiverWallet: data.receiverWallet,
      amount: data.amount,
      assetSymbol: getNativeAssetSymbol(),
      status: "success",
      txHash: data.txHash,
      type: "sent",
      recordSource: "blockchain",
      blockNumber: data.blockNumber,
      blockHash: data.blockHash || undefined,
      eventLogIndex: data.eventLogIndex,
      blockchainTimestamp: data.blockchainTimestamp,
      blockchainResultReceivedAt: receivedAt,
      blockchainSyncedAt: new Date(),
      lastReconciledAt: receivedAt,
      reconciliationMissCount: 0,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return { ingested: false, duplicate: true };
    }
    throw err;
  }

  await logAudit({
    userId: txDoc.senderUserId || null,
    action: "BLOCKCHAIN_TRANSFER_INGESTED",
    metadata: {
      transactionId: String(txDoc._id),
      txHash: txDoc.txHash,
      blockNumber: txDoc.blockNumber,
      senderWallet: txDoc.senderWallet,
      receiverWallet: txDoc.receiverWallet,
      amount: txDoc.amount,
    },
  });

  await refreshTransactionWalletBalances(txDoc, {
    syncedAt: txDoc.blockchainSyncedAt || receivedAt,
  });

  return { ingested: true };
}

async function syncTransferEvents(provider, config) {
  if (!config.eventSyncEnabled) {
    return { scanned: 0, ingested: 0, updated: 0, skipped: true, reason: "disabled" };
  }

  const contract = getRemittanceReadContract();
  const contractAddress = getRemittanceContractAddress();
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const stateKey = `${chainId}:${contractAddress.toLowerCase()}`;
  const latestBlock = await provider.getBlockNumber();
  const safeBlock = Math.max(0, latestBlock - config.eventConfirmations);
  const state = await BlockchainSyncState.findOne({ key: stateKey });

  const initialBlock =
    config.deploymentBlock ??
    Math.max(0, safeBlock - config.eventInitialLookbackBlocks);
  const fromBlock = state
    ? Math.max(
        0,
        state.lastProcessedBlock + 1 - config.eventReorgLookbackBlocks
      )
    : initialBlock;

  if (fromBlock > safeBlock) {
    return { scanned: 0, ingested: 0, updated: 0 };
  }

  let scanned = 0;
  let ingested = 0;
  let updated = 0;

  for (
    let batchStart = fromBlock;
    batchStart <= safeBlock;
    batchStart += config.eventBlockBatchSize
  ) {
    const batchEnd = Math.min(
      safeBlock,
      batchStart + config.eventBlockBatchSize - 1
    );
    let events;
    try {
      events = await contract.queryFilter(
        contract.filters.Transfer(),
        batchStart,
        batchEnd
      );
    } catch (err) {
      if (isRpcLogLimitError(err)) {
        return {
          scanned,
          ingested,
          updated,
          skipped: true,
          reason: "rpc_log_limit",
          error: normalizeError(err),
        };
      }
      throw err;
    }

    scanned += events.length;
    for (const event of events) {
      const result = await ingestTransferEvent(event);
      if (result.ingested) ingested += 1;
      if (result.updated) updated += 1;
    }

    await BlockchainSyncState.findOneAndUpdate(
      { key: stateKey },
      {
        $set: {
          chainId,
          contractAddress,
          lastProcessedBlock: batchEnd,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    );
  }

  return { scanned, ingested, updated };
}

export async function reconcileTransactions() {
  if (reconciliationRunning) {
    return { skipped: true, reason: "already_running" };
  }

  reconciliationRunning = true;
  try {
    const config = getConfig();
    const recheckSince = new Date(Date.now() - config.recheckWindowMs);
    const txs = await Transaction.find({
      txHash: { $type: "string", $ne: "" },
      $or: [
        { status: "pending" },
        {
          status: { $in: ["success", "failed"] },
          $or: [
            { lastReconciledAt: null },
            { blockchainSyncedAt: { $gte: recheckSince } },
          ],
        },
      ],
    })
      .sort({ lastReconciledAt: 1, updatedAt: 1 })
      .limit(config.batchSize);

    const provider = getRemittanceProvider();
    let corrected = 0;
    let errors = 0;

    for (const txDoc of txs) {
      try {
        const result = await reconcileTransaction(txDoc, provider, config);
        if (result.corrected) corrected += 1;
        if (result.error) errors += 1;
      } catch (err) {
        errors += 1;
        txDoc.reconciliationError = normalizeError(err) || "Reconciliation failed.";
        txDoc.lastReconciledAt = new Date();
        await txDoc.save().catch(() => {});
      }
    }

    let events = { scanned: 0, ingested: 0, updated: 0 };
    try {
      events = await syncTransferEvents(provider, config);
    } catch (err) {
      errors += 1;
      events = {
        ...events,
        error: normalizeError(err) || "Transfer event synchronization failed.",
      };
    }

    return { checked: txs.length, corrected, errors, events };
  } finally {
    reconciliationRunning = false;
  }
}

export function startTransactionReconciliation() {
  if (!reconciliationEnabled()) {
    console.log("Transaction reconciliation is disabled.");
    return () => {};
  }

  if (!process.env.BSC_TESTNET_RPC_URL) {
    console.warn(
      "Transaction reconciliation not started: BSC_TESTNET_RPC_URL is missing."
    );
    return () => {};
  }

  if (reconciliationTimer) {
    return () => clearInterval(reconciliationTimer);
  }

  const { intervalMs } = getConfig();
  const run = async () => {
    try {
      const result = await reconcileTransactions();
      if (
        result.corrected ||
        result.errors ||
        result.events?.ingested ||
        result.events?.updated
      ) {
        console.log("Transaction reconciliation:", result);
      }
      if (
        result.events?.reason === "rpc_log_limit" &&
        !eventSyncWarningLogged
      ) {
        console.warn(
          "Transaction event synchronization skipped: RPC endpoint rejected eth_getLogs.",
          result.events.error
        );
        eventSyncWarningLogged = true;
      }
    } catch (err) {
      console.error("Transaction reconciliation failed:", normalizeError(err));
    }
  };

  void run();
  reconciliationTimer = setInterval(run, intervalMs);
  reconciliationTimer.unref?.();

  return () => {
    clearInterval(reconciliationTimer);
    reconciliationTimer = undefined;
  };
}
