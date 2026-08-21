import assert from "node:assert/strict";
import test from "node:test";
import {
  apiRateLimit,
  getRateLimitPolicy,
  resetRateLimitBuckets,
} from "../src/middleware/rateLimit.js";
import { getMetricsSnapshot, resetMetrics } from "../src/utils/metrics.js";

function responseStub() {
  const headers = new Map();
  return {
    statusCode: 200,
    headers,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value));
    },
  };
}

function invoke(middleware, { path, ip = "127.0.0.1" }) {
  const res = responseStub();
  let called = false;
  let error;
  middleware({ originalUrl: path, ip }, res, (nextError) => {
    called = true;
    error = nextError;
  });
  return { called, error, res };
}

test.beforeEach(() => {
  resetRateLimitBuckets();
  resetMetrics();
});

test("rate limit policy selects sensitive endpoint groups and general fallback", () => {
  assert.equal(getRateLimitPolicy({ originalUrl: "/api/auth/login" }), "login");
  assert.equal(getRateLimitPolicy({ originalUrl: "/api/auth/forgot-password/reset" }), "passwordReset");
  assert.equal(getRateLimitPolicy({ originalUrl: "/api/auth/register/verify-code" }), "verification");
  assert.equal(getRateLimitPolicy({ originalUrl: "/api/transactions/send-code" }), "verification");
  assert.equal(getRateLimitPolicy({ originalUrl: "/api/transactions/my?limit=10" }), "transaction");
  assert.equal(getRateLimitPolicy({ originalUrl: "/api/users/search" }), "general");
});

test("login requests are throttled and return retry headers", () => {
  const middleware = apiRateLimit();
  for (let request = 1; request <= 5; request += 1) {
    const result = invoke(middleware, { path: "/api/auth/login" });
    assert.equal(result.error, undefined);
    assert.equal(result.res.headers.get("ratelimit-remaining"), String(5 - request));
  }

  const throttled = invoke(middleware, { path: "/api/auth/login/options" });
  assert.equal(throttled.called, true);
  assert.equal(throttled.error?.statusCode, 429);
  assert.match(throttled.error?.message, /Too many requests/);
  assert.equal(throttled.res.headers.get("ratelimit-limit"), "5");
  assert.ok(Number(throttled.res.headers.get("retry-after")) > 0);
  const hit = getMetricsSnapshot().counters.find((metric) => metric.name === "rate_limit_hits_total");
  assert.deepEqual(hit, { name: "rate_limit_hits_total", labels: { policy: "login" }, value: 1 });
});

test("sensitive categories use independent shared counters", () => {
  const policies = {
    login: { windowMs: 1_000, max: 1 },
    passwordReset: { windowMs: 1_000, max: 1 },
    verification: { windowMs: 1_000, max: 1 },
    transaction: { windowMs: 1_000, max: 1 },
    general: { windowMs: 1_000, max: 2 },
  };
  const middleware = apiRateLimit({ policies, now: () => 10_000 });

  assert.equal(invoke(middleware, { path: "/api/auth/forgot-password/start" }).error, undefined);
  assert.equal(invoke(middleware, { path: "/api/auth/forgot-password/verify" }).error?.statusCode, 429);
  assert.equal(invoke(middleware, { path: "/api/auth/verify-code" }).error, undefined);
  assert.equal(invoke(middleware, { path: "/api/transactions/send" }).error, undefined);
  assert.equal(invoke(middleware, { path: "/api/health" }).error, undefined);
  assert.equal(invoke(middleware, { path: "/api/me" }).error, undefined);
  assert.equal(invoke(middleware, { path: "/api/users/search" }).error, undefined);
  assert.equal(invoke(middleware, { path: "/api/users/search" }).error?.statusCode, 429);
});

test("health checks bypass rate limits and application windows reset", () => {
  let timestamp = 1_000;
  const policy = { windowMs: 100, max: 1 };
  const policies = {
    login: policy,
    passwordReset: policy,
    verification: policy,
    transaction: policy,
    general: policy,
  };
  const middleware = apiRateLimit({ policies, now: () => timestamp });

  assert.equal(invoke(middleware, { path: "/api/health" }).error, undefined);
  assert.equal(invoke(middleware, { path: "/api/health" }).error, undefined);
  assert.equal(invoke(middleware, { path: "/api/me" }).error, undefined);
  assert.equal(invoke(middleware, { path: "/api/me" }).error?.statusCode, 429);
  timestamp += 100;
  assert.equal(invoke(middleware, { path: "/api/me" }).error, undefined);
});
