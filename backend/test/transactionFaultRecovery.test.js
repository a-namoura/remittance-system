import assert from "node:assert/strict";
import test from "node:test";
import {
  recordTransactionSubmission,
  settleTransactionAfterSubmission,
} from "../src/utils/transactionRequests.js";
import { reconcileTransaction } from "../src/blockchain/transactionReconciliation.js";

const senderWallet = "0x1111111111111111111111111111111111111111";
const receiverWallet = "0x2222222222222222222222222222222222222222";

function transaction(overrides = {}) {
  return {
    _id: "recovery-transaction",
    senderWallet,
    receiverWallet,
    amount: 1.25,
    assetSymbol: "BNB",
    status: "pending",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    async save() {},
    ...overrides,
  };
}

function assertIdentity(txDoc) {
  assert.equal(txDoc.senderWallet, senderWallet);
  assert.equal(txDoc.receiverWallet, receiverWallet);
  assert.equal(txDoc.amount, 1.25);
  assert.equal(txDoc.assetSymbol, "BNB");
}

test("a temporary database write failure after broadcast retains a complete reconciliation snapshot", async () => {
  let recovered;
  const submittedAt = new Date("2026-08-02T10:00:00.000Z");
  const txDoc = transaction({
    async save() { throw new Error("MongoDB temporarily unavailable"); },
    constructor: {
      async updateOne(_filter, update) { recovered = structuredClone(update.$set); },
    },
  });

  await assert.rejects(
    recordTransactionSubmission(txDoc, { txHash: "0xbroadcast", submittedAt }),
    /temporarily unavailable/
  );

  assertIdentity(recovered);
  assert.equal(recovered.txHash, "0xbroadcast");
  assert.equal(recovered.status, "pending");
  assert.deepEqual(recovered.blockchainSubmittedAt, submittedAt);
  assert.equal(recovered.reconciliationMissCount, 0);
});

test("temporary RPC receipt failures preserve pending and terminal records for retry", async () => {
  const rpcDown = { async getTransactionReceipt() { throw Object.assign(new Error("RPC timeout"), { code: "TIMEOUT" }); } };
  for (const initialStatus of ["pending", "success", "failed"]) {
    const txDoc = transaction({
      status: initialStatus,
      txHash: "0xsubmitted",
      blockchainSubmittedAt: new Date("2026-08-02T10:00:00.000Z"),
      blockchainResultReceivedAt: initialStatus === "pending" ? undefined : new Date("2026-08-02T10:01:00.000Z"),
    });
    const result = await reconcileTransaction(txDoc, rpcDown, {});
    assert.deepEqual(result, { corrected: false, error: true });
    assert.equal(txDoc.status, initialStatus);
    assert.equal(txDoc.txHash, "0xsubmitted");
    assertIdentity(txDoc);
    assert.match(txDoc.reconciliationError, /RPC timeout/);
  }
});

test("restart reconciliation writes final chain success and failure without changing transfer identity", async () => {
  for (const [receiptStatus, expectedStatus] of [[1, "success"], [0, "failed"]]) {
    // This is a fresh document instance, as it would be after an application restart.
    const txDoc = transaction({
      txHash: `0xrestart${receiptStatus}`,
      blockchainSubmittedAt: new Date("2026-08-02T10:00:00.000Z"),
      // Invalid addresses deliberately make the wallet-balance side effect a
      // no-op; this test is solely the durable transaction recovery path.
      ...(receiptStatus === 1
        ? { senderWallet: "restart-sender", receiverWallet: "restart-receiver" }
        : {}),
    });
    const originalIdentity = {
      senderWallet: txDoc.senderWallet,
      receiverWallet: txDoc.receiverWallet,
      amount: txDoc.amount,
      assetSymbol: txDoc.assetSymbol,
      createdAt: txDoc.createdAt,
    };
    const provider = {
      calls: 0,
      async getTransactionReceipt(hash) {
        this.calls += 1;
        return {
          hash,
          status: receiptStatus,
          blockNumber: 99,
          logs: [],
        };
      },
    };
    const result = await reconcileTransaction(txDoc, provider, {}, {
      receiptTransferEvent: () => ({
        senderWallet: originalIdentity.senderWallet,
        receiverWallet: originalIdentity.receiverWallet,
        amount: originalIdentity.amount,
      }),
    });
    assert.equal(result.corrected, true);
    assert.equal(txDoc.status, expectedStatus);
    assert.equal(txDoc.txHash, `0xrestart${receiptStatus}`);
    assert.equal(txDoc.blockNumber, 99);
    assert.ok(txDoc.blockchainResultReceivedAt instanceof Date);
    assert.ok(txDoc.blockchainSyncedAt instanceof Date);
    assert.deepEqual(
      {
        senderWallet: txDoc.senderWallet,
        receiverWallet: txDoc.receiverWallet,
        amount: txDoc.amount,
      assetSymbol: txDoc.assetSymbol,
      createdAt: txDoc.createdAt,
      },
      originalIdentity
    );
    assert.equal(provider.calls, 1);

    // A subsequent reconciliation only re-reads the existing hash; it does
    // not create a transaction or invoke the submission path again.
    const repeated = await reconcileTransaction(txDoc, provider, {}, {
      receiptTransferEvent: () => ({
        senderWallet: originalIdentity.senderWallet,
        receiverWallet: originalIdentity.receiverWallet,
        amount: originalIdentity.amount,
      }),
    });
    assert.deepEqual(repeated, { corrected: false });
    assert.equal(provider.calls, 2);
  }
});

test("temporary confirmation RPC failure stays pending and does not submit a duplicate transaction", async () => {
  let saves = 0;
  let submissions = 0;
  const txDoc = transaction({ txHash: "0xsubmitted", async save() { saves += 1; } });
  settleTransactionAfterSubmission({
    txDoc,
    submission: {
      async waitForConfirmation() {
        submissions += 1;
        throw Object.assign(new Error("RPC network timeout"), { code: "NETWORK_ERROR" });
      },
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(submissions, 1);
  assert.equal(txDoc.status, "pending");
  assert.match(txDoc.reconciliationError, /RPC network timeout/);
  assert.ok(saves >= 1);
  assertIdentity(txDoc);
});
