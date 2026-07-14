import assert from "node:assert/strict";
import test from "node:test";
import {
  getTransactionSyncTimeoutMs,
  isTransactionSyncError,
  markTransactionFailed,
  recordTransactionSubmission,
  settleTransactionAfterSubmission,
  syncTransactionWithBlockchainResult,
} from "../src/utils/transactionRequests.js";

function waitFor(predicate, timeoutMs = 500) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("Timed out waiting for condition."));
        return;
      }

      setTimeout(check, 5);
    };

    check();
  });
}

test("markTransactionFailed awaits the transaction save", async () => {
  let saveFinished = false;
  const txDoc = {
    status: "pending",
    async save() {
      await new Promise((resolve) => setTimeout(resolve, 20));
      saveFinished = true;
    },
  };

  await markTransactionFailed(txDoc, new Error("chain reverted"));

  assert.equal(saveFinished, true);
  assert.equal(txDoc.status, "failed");
  assert.equal(txDoc.failureReason, "chain reverted");
});

test("markTransactionFailed surfaces transaction sync timeout errors", async () => {
  const previousTimeout = process.env.TRANSACTION_SYNC_TIMEOUT_MS;
  process.env.TRANSACTION_SYNC_TIMEOUT_MS = "10";

  const txDoc = {
    status: "pending",
    save() {
      return new Promise(() => {});
    },
  };

  try {
    await assert.rejects(
      markTransactionFailed(txDoc, new Error("chain reverted")),
      (err) => {
        assert.equal(isTransactionSyncError(err), true);
        assert.match(err.message, /exceeded 10ms/);
        return true;
      }
    );
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.TRANSACTION_SYNC_TIMEOUT_MS;
    } else {
      process.env.TRANSACTION_SYNC_TIMEOUT_MS = previousTimeout;
    }
  }
});

test("settlement failure logs save sync errors and still runs failure callback", async (t) => {
  const previousTimeout = process.env.TRANSACTION_SYNC_TIMEOUT_MS;
  process.env.TRANSACTION_SYNC_TIMEOUT_MS = "10";

  const logged = [];
  t.mock.method(console, "error", (...args) => {
    logged.push(args);
  });

  let failureCallbackCalled = false;
  const chainError = new Error("chain reverted");
  const txDoc = {
    status: "pending",
    save() {
      return new Promise(() => {});
    },
  };

  try {
    settleTransactionAfterSubmission({
      txDoc,
      submission: {
        async waitForConfirmation() {
          throw chainError;
        },
      },
      onFailure: async ({ error }) => {
        failureCallbackCalled = error === chainError;
      },
    });

    await waitFor(() => failureCallbackCalled);

    assert.equal(txDoc.status, "failed");
    assert.equal(
      logged.some(([message]) => message === "Transaction failure sync failed:"),
      true
    );
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.TRANSACTION_SYNC_TIMEOUT_MS;
    } else {
      process.env.TRANSACTION_SYNC_TIMEOUT_MS = previousTimeout;
    }
  }
});

test("settlement starts confirmation asynchronously after broadcast", async () => {
  let waitStarted = false;
  let waitResolved = false;
  let resolveConfirmation;
  const txDoc = {
    status: "pending",
    async save() {},
  };

  settleTransactionAfterSubmission({
    txDoc,
    submission: {
      waitForConfirmation() {
        waitStarted = true;
        return new Promise((resolve) => {
          resolveConfirmation = () => {
            waitResolved = true;
            resolve({ txHash: "0xabc", status: 1, blockNumber: 123 });
          };
        });
      },
    },
  });

  assert.equal(waitStarted, true);
  assert.equal(waitResolved, false);
  assert.equal(txDoc.status, "pending");

  resolveConfirmation();
  await waitFor(() => txDoc.status === "success");

  assert.equal(txDoc.txHash, "0xabc");
  assert.equal(txDoc.blockNumber, 123);
});

test("transaction result sync uses a 2 second default SLA", async () => {
  const previousTimeout = process.env.TRANSACTION_SYNC_TIMEOUT_MS;
  delete process.env.TRANSACTION_SYNC_TIMEOUT_MS;

  let saveCalledAt;
  const txDoc = {
    status: "pending",
    async save() {
      saveCalledAt = Date.now();
    },
  };
  const receivedAt = new Date();

  try {
    assert.equal(getTransactionSyncTimeoutMs(), 2000);

    await syncTransactionWithBlockchainResult(
      txDoc,
      { txHash: "0xdef", status: 0, blockNumber: 456 },
      { receivedAt, failureReason: "reverted" }
    ).catch((err) => {
      assert.equal(err.blockchainExecutionFailed, true);
    });

    assert.equal(txDoc.status, "failed");
    assert.equal(txDoc.txHash, "0xdef");
    assert.equal(txDoc.failureReason, "reverted");
    assert.ok(saveCalledAt - receivedAt.getTime() < 2000);
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.TRANSACTION_SYNC_TIMEOUT_MS;
    } else {
      process.env.TRANSACTION_SYNC_TIMEOUT_MS = previousTimeout;
    }
  }
});

test("submission recovery persists reconciliation fields when document save fails", async () => {
  let recoveryFilter;
  let recoveryUpdate;
  const txDoc = {
    _id: "transaction-id",
    senderWallet: "0xsender",
    receiverWallet: "0xreceiver",
    amount: 1.25,
    assetSymbol: "ETH",
    reconciliationMissCount: 4,
    reconciliationError: "old error",
    async save() {
      throw new Error("primary save unavailable");
    },
    constructor: {
      async updateOne(filter, update) {
        recoveryFilter = filter;
        recoveryUpdate = update;
      },
    },
  };

  await assert.rejects(
    recordTransactionSubmission(txDoc, {
      txHash: "0xsubmitted",
      submittedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
    /primary save unavailable/
  );

  assert.deepEqual(recoveryFilter, { _id: "transaction-id" });
  assert.equal(recoveryUpdate.$set.txHash, "0xsubmitted");
  assert.equal(recoveryUpdate.$set.senderWallet, "0xsender");
  assert.equal(recoveryUpdate.$set.receiverWallet, "0xreceiver");
  assert.equal(recoveryUpdate.$set.amount, 1.25);
  assert.equal(recoveryUpdate.$set.assetSymbol, "ETH");
});
