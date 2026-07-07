import assert from "node:assert/strict";
import test from "node:test";
import {
  isTransactionSyncError,
  markTransactionFailed,
  settleTransactionAfterSubmission,
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
