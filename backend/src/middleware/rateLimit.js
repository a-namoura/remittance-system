import { incrementMetric } from "../utils/metrics.js";
import { createHash } from "node:crypto";

const buckets = new Map();

const minute = 60_000;

export const RATE_LIMIT_POLICIES = Object.freeze({
  // This endpoint both validates the login and delivers/resends a one-time
  // code, so a five-request bucket locks legitimate users out too quickly.
  login: Object.freeze({ windowMs: 15 * minute, max: 20 }),
  loginOptions: Object.freeze({ windowMs: 15 * minute, max: 30 }),
  passwordReset: Object.freeze({ windowMs: 15 * minute, max: 5 }),
  verification: Object.freeze({ windowMs: 10 * minute, max: 5 }),
  transaction: Object.freeze({ windowMs: 5 * minute, max: 30 }),
  read: Object.freeze({ windowMs: 15 * minute, max: 1_200 }),
  general: Object.freeze({ windowMs: 15 * minute, max: 300 }),
});

function requestPath(req) {
  return String(req.originalUrl || req.url || req.path || "")
    .split("?", 1)[0]
    .replace(/^\/api(?=\/|$)/, "");
}

export function getRateLimitPolicy(req) {
  const path = requestPath(req);
  const method = String(req.method || "GET").toUpperCase();

  if (path.startsWith("/auth/forgot-password/")) return "passwordReset";
  if (path === "/auth/login/options") return "loginOptions";
  if (path === "/auth/login") return "login";
  if (
    path === "/auth/verify-code" ||
    path === "/auth/resend-code" ||
    path === "/auth/register/send-code" ||
    path === "/auth/register/verify-code" ||
    path === "/auth/register/log-phone-code" ||
    path === "/transactions/send-code"
  ) {
    return "verification";
  }
  if (
    method !== "GET" &&
    method !== "HEAD" &&
    (path === "/transactions" || path.startsWith("/transactions/"))
  ) {
    return "transaction";
  }
  if (method === "GET" || method === "HEAD") return "read";
  return "general";
}

function clientKey(req, policyName) {
  const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
  const authorization = String(req.headers?.authorization || "").trim();

  // Authenticated application traffic must not share a single allowance just
  // because several users are behind the same proxy or NAT. Login and other
  // pre-authentication limits deliberately remain IP-based.
  if ((policyName === "read" || policyName === "general" || policyName === "transaction") && authorization) {
    const credentialHash = createHash("sha256").update(authorization).digest("hex");
    return `${ip}:${credentialHash}`;
  }

  return ip;
}

export function apiRateLimit({ policies = RATE_LIMIT_POLICIES, now = Date.now } = {}) {
  return (req, res, next) => {
    // Health probes must remain available even when an application client has
    // exhausted its request budget; otherwise a healthy server appears down.
    if (requestPath(req).startsWith("/health")) return next();

    const policyName = getRateLimitPolicy(req);
    const policy = policies[policyName];
    const timestamp = now();
    const key = `${policyName}:${clientKey(req, policyName)}`;
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= timestamp
      ? { count: 0, resetAt: timestamp + policy.windowMs }
      : current;

    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= timestamp) buckets.delete(bucketKey);
      }
    }

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000));
    res.setHeader("RateLimit-Limit", String(policy.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, policy.max - bucket.count)));
    res.setHeader("RateLimit-Reset", String(retryAfter));

    if (bucket.count <= policy.max) return next();

    incrementMetric("rate_limit_hits_total", { policy: policyName });
    res.setHeader("Retry-After", String(retryAfter));
    const error = new Error("Too many requests. Please try again later.");
    error.statusCode = 429;
    return next(error);
  };
}

export function resetRateLimitBuckets() {
  buckets.clear();
}
