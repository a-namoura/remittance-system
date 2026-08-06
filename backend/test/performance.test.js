import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import express from "express";
import request from "supertest";
import { getApiResponseSlaMs, responseSlaMonitor } from "../src/middleware/performance.js";
import { recordTransactionSubmission, settleTransactionAfterSubmission } from "../src/utils/transactionRequests.js";
import { apiRouter } from "../src/routes/index.js";

const SLA_MS = 2_000;
const RECIPIENT = "0x2222222222222222222222222222222222222222";

function createPersistedMongoTransaction() {
  let persisted = null;
  let persistedAt = null;
  const txDoc = {
    _id: "transaction-1",
    status: "pending",
    txHash: "0xsubmitted",
    failureReason: undefined,
    blockchainResultReceivedAt: undefined,
    blockchainSyncedAt: undefined,
    blockNumber: undefined,
    reconciliationMissCount: 0,
    reconciliationError: undefined,
    async save() {
      // Model the asynchronous MongoDB write; settlement must wait for this
      // persisted terminal snapshot before it reports completion.
      await new Promise((resolve) => setTimeout(resolve, 20));
      persistedAt = Date.now();
      persisted = {
        status: txDoc.status,
        txHash: txDoc.txHash,
        failureReason: txDoc.failureReason,
        blockchainResultReceivedAt: txDoc.blockchainResultReceivedAt,
        blockchainSyncedAt: txDoc.blockchainSyncedAt,
        blockNumber: txDoc.blockNumber,
      };
    },
  };

  return {
    txDoc,
    getPersisted: () => persisted,
    getPersistedAt: () => persistedAt,
  };
}

async function settleAndWaitForPersistence({ txDoc, result }) {
  let callbackPayload;
  const settled = new Promise((resolve) => {
    settleTransactionAfterSubmission({
      txDoc,
      submission: {
        async waitForConfirmation() {
          return result;
        },
      },
      onSuccess: (payload) => {
        callbackPayload = payload;
        resolve();
      },
      onFailure: (payload) => {
        callbackPayload = payload;
        resolve();
      },
    });
  });

  const blockchainResultAt = Date.now();
  await settled;
  return { blockchainResultAt, callbackPayload };
}

test("API response SLA is 2 seconds by default", () => {
  const previous = process.env.API_RESPONSE_SLA_MS;
  delete process.env.API_RESPONSE_SLA_MS;
  try {
    assert.equal(getApiResponseSlaMs(), SLA_MS);
  } finally {
    if (previous === undefined) delete process.env.API_RESPONSE_SLA_MS;
    else process.env.API_RESPONSE_SLA_MS = previous;
  }
});

test("API middleware starts and completes within the 2 second SLA", () => {
  const res = new EventEmitter();
  const headers = new Map();
  res.setHeader = (name, value) => headers.set(name, value);
  let nextCalled = false;
  const startedAt = Date.now();

  responseSlaMonitor({ method: "GET", originalUrl: "/api/health" }, res, () => {
    nextCalled = true;
  });
  res.emit("finish");

  assert.equal(nextCalled, true);
  assert.equal(headers.get("X-Response-Sla-Ms"), String(SLA_MS));
  assert.ok(Date.now() - startedAt <= SLA_MS);
});

test("representative API routes carry the 2 second response SLA", () => {
  for (const [method, originalUrl] of [
    ["GET", "/api/me"],
    ["GET", "/api/transactions/my?limit=10"],
    ["POST", "/api/transactions/send-code"],
    ["POST", "/api/transactions/send"],
  ]) {
    const res = new EventEmitter();
    const headers = new Map();
    res.setHeader = (name, value) => headers.set(name, value);
    const startedAt = Date.now();
    responseSlaMonitor({ method, originalUrl }, res, () => {});
    res.emit("finish");
    assert.equal(headers.get("X-Response-Sla-Ms"), String(SLA_MS));
    assert.ok(Date.now() - startedAt <= SLA_MS, `${method} ${originalUrl}`);
  }
});

test("real representative Express endpoints respond within 2 seconds with mocked services", async (t) => {
  const app = express();
  app.use(express.json());
  app.use(responseSlaMonitor);
  app.use("/api", apiRouter);
  app.use((err, req, res, next) => res.status(res.statusCode >= 400 ? res.statusCode : 500).json({ message: err.message }));

  // These protected routes short-circuit before touching MongoDB or blockchain
  // services; the request harness therefore exercises actual Express routing
  // without any live infrastructure dependency.
  for (const endpoint of ["/api/health", "/api/me", "/api/transactions/my?limit=10", "/api/transactions/send"]) {
    const startedAt = Date.now();
    const response = endpoint === "/api/transactions/send"
      ? await request(app).post(endpoint).send({ receiverWallet: RECIPIENT, amountEth: 1 })
      : await request(app).get(endpoint);
    assert.ok([200, 401].includes(response.status), endpoint);
    assert.equal(response.headers["x-response-sla-ms"], String(SLA_MS));
    assert.ok(Date.now() - startedAt <= SLA_MS, endpoint);
  }
});

test("transaction submission returns before confirmation and within 2 seconds", async () => {
  let confirmationStarted = false;
  const txDoc = {
    status: "pending",
    async save() {},
  };
  const startedAt = Date.now();

  await recordTransactionSubmission(txDoc, {
    txHash: "0xsubmitted",
    submittedAt: new Date(),
  });
  settleTransactionAfterSubmission({
    txDoc,
    submission: {
      waitForConfirmation() {
        confirmationStarted = true;
        return new Promise(() => {});
      },
    },
  });

  assert.equal(confirmationStarted, true);
  assert.equal(txDoc.status, "pending");
  assert.ok(Date.now() - startedAt <= SLA_MS);

});

test("final successful blockchain result is persisted to the MongoDB transaction within 2 seconds", async () => {
  const mongoTransaction = createPersistedMongoTransaction();
  const result = {
    txHash: "0xconfirmed",
    status: 1,
    blockNumber: 12345,
  };

  const { blockchainResultAt, callbackPayload } = await settleAndWaitForPersistence({
    txDoc: mongoTransaction.txDoc,
    result,
  });
  const persisted = mongoTransaction.getPersisted();

  assert.equal(callbackPayload.txDoc, mongoTransaction.txDoc);
  assert.ok(mongoTransaction.getPersistedAt() - blockchainResultAt <= SLA_MS);
  assert.equal(persisted.status, "success");
  assert.equal(persisted.txHash, result.txHash);
  assert.equal(persisted.failureReason, undefined);
  assert.equal(persisted.blockNumber, result.blockNumber);
  assert.ok(persisted.blockchainResultReceivedAt instanceof Date);
  assert.ok(persisted.blockchainSyncedAt instanceof Date);
  assert.ok(persisted.blockchainSyncedAt >= persisted.blockchainResultReceivedAt);
});

test("final failed blockchain result is persisted to the MongoDB transaction within 2 seconds", async () => {
  const mongoTransaction = createPersistedMongoTransaction();
  const result = {
    txHash: "0xreverted",
    status: 0,
    blockNumber: 12346,
  };

  const { blockchainResultAt, callbackPayload } = await settleAndWaitForPersistence({
    txDoc: mongoTransaction.txDoc,
    result,
  });
  const persisted = mongoTransaction.getPersisted();

  assert.equal(callbackPayload.error.blockchainExecutionFailed, true);
  assert.ok(mongoTransaction.getPersistedAt() - blockchainResultAt <= SLA_MS);
  assert.equal(persisted.status, "failed");
  assert.equal(persisted.txHash, result.txHash);
  assert.equal(persisted.failureReason, "Blockchain execution failed.");
  assert.equal(persisted.blockNumber, result.blockNumber);
  assert.ok(persisted.blockchainResultReceivedAt instanceof Date);
  assert.ok(persisted.blockchainSyncedAt instanceof Date);
  assert.ok(persisted.blockchainSyncedAt >= persisted.blockchainResultReceivedAt);
});
