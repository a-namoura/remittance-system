import assert from "node:assert/strict";
import test from "node:test";
import {
  recordTransactionSubmission,
  syncTransactionWithBlockchainResult,
} from "../src/utils/transactionRequests.js";
import {
  reconcileTransaction,
  transferMatchesTransaction,
} from "../src/blockchain/transactionReconciliation.js";

const senderWallet = "0x1111111111111111111111111111111111111111";
const receiverWallet = "0x2222222222222222222222222222222222222222";

function transaction(overrides = {}) {
  return {
    _id: "transaction-1",
    senderWallet,
    receiverWallet,
    amount: 1.25,
    assetSymbol: "BNB",
    status: "pending",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    async save() {},
    ...overrides,
  };
}

function assertTransferFields(txDoc) {
  assert.equal(txDoc.senderWallet, senderWallet);
  assert.equal(txDoc.receiverWallet, receiverWallet);
  assert.equal(txDoc.amount, 1.25);
}

test("pending blockchain submission retains MongoDB transfer fields and submission timestamp", async () => {
  const txDoc = transaction();
  const submittedAt = new Date("2026-08-02T10:00:00.000Z");

  await recordTransactionSubmission(txDoc, { txHash: "0xpending", submittedAt });

  assertTransferFields(txDoc);
  assert.equal(txDoc.status, "pending");
  assert.equal(txDoc.txHash, "0xpending");
  assert.deepEqual(txDoc.blockchainSubmittedAt, submittedAt);
  assert.equal(txDoc.blockNumber, undefined);
  assert.equal(txDoc.reconciliationMissCount, 0);
});

test("successful blockchain result synchronizes MongoDB status, hash, block, and timestamps", async () => {
  // These fixture addresses intentionally bypass balance-refresh I/O; this test
  // is exclusively about transaction persistence.
  const txDoc = transaction({
    txHash: "0xsubmitted",
    senderWallet: "sender-wallet",
    receiverWallet: "receiver-wallet",
  });
  const receivedAt = new Date();

  await syncTransactionWithBlockchainResult(txDoc, {
    txHash: "0xsuccessful",
    status: 1,
    blockNumber: 101,
  }, { receivedAt });

  assert.equal(txDoc.senderWallet, "sender-wallet");
  assert.equal(txDoc.receiverWallet, "receiver-wallet");
  assert.equal(txDoc.amount, 1.25);
  assert.equal(txDoc.status, "success");
  assert.equal(txDoc.txHash, "0xsuccessful");
  assert.equal(txDoc.blockNumber, 101);
  assert.deepEqual(txDoc.blockchainResultReceivedAt, receivedAt);
  assert.ok(txDoc.blockchainSyncedAt instanceof Date);
  assert.equal(txDoc.reconciliationMissCount, 0);
  assert.equal(txDoc.reconciliationError, undefined);
});

test("failed blockchain result synchronizes MongoDB without losing transfer fields", async () => {
  const txDoc = transaction({ txHash: "0xsubmitted" });
  const receivedAt = new Date();

  await assert.rejects(
    syncTransactionWithBlockchainResult(txDoc, {
      txHash: "0xfailed",
      status: 0,
      blockNumber: 102,
    }, { receivedAt, failureReason: "execution reverted" }),
    (error) => error.blockchainExecutionFailed === true
  );

  assertTransferFields(txDoc);
  assert.equal(txDoc.status, "failed");
  assert.equal(txDoc.txHash, "0xfailed");
  assert.equal(txDoc.blockNumber, 102);
  assert.equal(txDoc.failureReason, "execution reverted");
  assert.deepEqual(txDoc.blockchainResultReceivedAt, receivedAt);
  assert.ok(txDoc.blockchainSyncedAt instanceof Date);
});

test("reconciliation compares every transfer identity field before accepting an event", () => {
  const txDoc = transaction({ txHash: "0xconfirmed" });
  const matchingEvent = {
    senderWallet: senderWallet.toUpperCase(),
    receiverWallet: receiverWallet.toUpperCase(),
    amount: 1.25,
  };

  assert.deepEqual(transferMatchesTransaction(txDoc, matchingEvent), { matches: true });
  for (const field of ["senderWallet", "receiverWallet", "amount"]) {
    const event = {
      ...matchingEvent,
      [field]: field === "amount" ? 2 : "0x3333333333333333333333333333333333333333",
    };
    assert.equal(transferMatchesTransaction(txDoc, event).matches, false, `${field} mismatch must be rejected`);
  }
  assert.equal(transferMatchesTransaction({ ...txDoc, assetSymbol: "ETH" }, matchingEvent).matches, false);
});

test("reconciliation preserves terminal records when a receipt is temporarily unavailable", async () => {
  const originalReceivedAt = new Date("2026-08-05T10:00:00.000Z");
  const originalSyncedAt = new Date("2026-08-05T10:01:00.000Z");
  const txDoc = transaction({
    status: "success",
    txHash: "0xconfirmed",
    blockNumber: 103,
    blockchainResultReceivedAt: originalReceivedAt,
    blockchainSyncedAt: originalSyncedAt,
    reconciliationMissCount: 2,
  });
  const provider = { async getTransactionReceipt() { return null; } };

  const result = await reconcileTransaction(txDoc, provider, {
    missThreshold: 3,
    pendingTimeoutMs: 1,
  });

  assert.deepEqual(result, { corrected: false, missing: true });
  assertTransferFields(txDoc);
  assert.equal(txDoc.status, "success");
  assert.equal(txDoc.txHash, "0xconfirmed");
  assert.equal(txDoc.blockNumber, 103);
  assert.deepEqual(txDoc.blockchainResultReceivedAt, originalReceivedAt);
  assert.deepEqual(txDoc.blockchainSyncedAt, originalSyncedAt);
  assert.equal(txDoc.reconciliationMissCount, 3);
  assert.match(txDoc.reconciliationError, /terminal transaction/);
  assert.ok(txDoc.lastReconciledAt instanceof Date);
});
