import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { getApiResponseSlaMs, responseSlaMonitor } from "../src/middleware/performance.js";
import { recordTransactionSubmission, settleTransactionAfterSubmission } from "../src/utils/transactionRequests.js";

const SLA_MS = 2_000;

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
