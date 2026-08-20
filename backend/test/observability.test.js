import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { createRequestContext, redact, runWithLogContext, addLogContext } from "../src/utils/logging.js";
import { getMetricsSnapshot, incrementMetric, observeMetric, resetMetrics } from "../src/utils/metrics.js";

test("request context accepts safe IDs, returns them, and supports transaction correlation", async () => {
  const app = express();
  app.use(createRequestContext);
  app.get("/context", (req, res) => {
    let context;
    runWithLogContext({ requestId: req.requestId, correlationId: req.correlationId }, () => {
      addLogContext({ transactionId: "tx-123" });
      context = { requestId: req.requestId, correlationId: req.correlationId, transactionId: "tx-123" };
    });
    res.json(context);
  });
  const response = await request(app)
    .get("/context")
    .set("X-Request-Id", "request-123")
    .set("X-Correlation-Id", "correlation-456");
  assert.equal(response.headers["x-request-id"], "request-123");
  assert.equal(response.headers["x-correlation-id"], "correlation-456");
  assert.equal(response.body.transactionId, "tx-123");
});

test("unsafe supplied request IDs are replaced", async () => {
  const app = express();
  app.use(createRequestContext);
  app.get("/", (req, res) => res.json({ requestId: req.requestId }));
  const response = await request(app).get("/").set("X-Request-Id", "bad id value");
  assert.notEqual(response.body.requestId, "bad id value");
  assert.match(response.body.requestId, /^[0-9a-f-]{36}$/i);
});

test("redaction removes secrets and direct personal/payment identifiers", () => {
  const safe = redact({
    authorization: "Bearer abc",
    password: "secret",
    email: "person@example.com",
    senderWallet: "0x111",
    nested: { token: "req_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  });
  assert.deepEqual(safe, {
    authorization: "[REDACTED]",
    password: "[REDACTED]",
    email: "[REDACTED]",
    senderWallet: "[REDACTED]",
    nested: { token: "[REDACTED]" },
  });
});

test("metrics retain labeled counters and timing aggregates", () => {
  resetMetrics();
  incrementMetric("transactions_created_total", { flow: "direct_send" });
  incrementMetric("transactions_created_total", { flow: "direct_send" }, 2);
  observeMetric("reconciliation_run_duration_ms", 10, { outcome: "success" });
  observeMetric("reconciliation_run_duration_ms", 30, { outcome: "success" });
  const snapshot = getMetricsSnapshot();
  assert.equal(snapshot.counters[0].value, 3);
  assert.deepEqual(snapshot.timings[0], {
    name: "reconciliation_run_duration_ms",
    labels: { outcome: "success" },
    count: 2,
    totalMs: 40,
    maxMs: 30,
  });
});
