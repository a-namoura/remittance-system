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
