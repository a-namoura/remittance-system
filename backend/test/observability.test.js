import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { createRequestContext, redact, runWithLogContext, addLogContext } from "../src/utils/logging.js";
import { getMetricsSnapshot, getPublicMetricsSnapshot, incrementMetric, observeMetric, resetMetrics, setMetric } from "../src/utils/metrics.js";
import { responseSlaMonitor } from "../src/middleware/performance.js";
import { apiRouter } from "../src/routes/index.js";

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
  assert.deepEqual(snapshot.gauges, []);
});

test("metrics support gauges and strip non-public labels from exported data", () => {
  resetMetrics();
  setMetric("reconciliation_lag_blocks", 12, { operation: "event_sync", wallet: "0xsecret" });
  const snapshot = getPublicMetricsSnapshot();
  assert.deepEqual(snapshot.gauges[0], {
    name: "reconciliation_lag_blocks",
    labels: { operation: "event_sync" },
    value: 12,
  });
  assert.equal(JSON.stringify(snapshot).includes("0xsecret"), false);
});

test("request middleware counts API errors and latency without request data labels", async () => {
  resetMetrics();
  const app = express();
  app.use(responseSlaMonitor);
  app.get("/failure/:id", (req, res) => res.status(500).json({ error: "failed" }));
  await request(app).get("/failure/sensitive-value");
  const snapshot = getMetricsSnapshot();
  assert.equal(snapshot.counters.find((metric) => metric.name === "http_requests_total")?.value, 1);
  assert.equal(snapshot.counters.find((metric) => metric.name === "http_errors_total")?.value, 1);
  assert.equal(snapshot.timings.find((metric) => metric.name === "http_request_duration_ms")?.count, 1);
  assert.equal(JSON.stringify(snapshot).includes("sensitive-value"), false);
});

test("metrics endpoint is admin-protected by default and explicitly configurable as public", async () => {
  const previous = process.env.METRICS_PUBLIC;
  const app = express();
  app.use("/api", apiRouter);
  app.use((err, req, res, next) => res.status(res.statusCode >= 400 ? res.statusCode : 500).json({ message: err.message }));
  try {
    delete process.env.METRICS_PUBLIC;
    assert.equal((await request(app).get("/api/metrics")).status, 401);
    process.env.METRICS_PUBLIC = "true";
    const response = await request(app).get("/api/metrics");
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.counters));
    assert.ok(Array.isArray(response.body.timings));
    assert.ok(Array.isArray(response.body.gauges));
  } finally {
    if (previous === undefined) delete process.env.METRICS_PUBLIC;
    else process.env.METRICS_PUBLIC = previous;
  }
});
