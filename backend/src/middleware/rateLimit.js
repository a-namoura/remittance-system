const buckets = new Map();

const minute = 60_000;

export const RATE_LIMIT_POLICIES = Object.freeze({
  login: Object.freeze({ windowMs: 15 * minute, max: 5 }),
  passwordReset: Object.freeze({ windowMs: 15 * minute, max: 5 }),
  verification: Object.freeze({ windowMs: 10 * minute, max: 5 }),
  transaction: Object.freeze({ windowMs: 5 * minute, max: 30 }),
  general: Object.freeze({ windowMs: 15 * minute, max: 100 }),
});

function requestPath(req) {
  return String(req.originalUrl || req.url || req.path || "")
    .split("?", 1)[0]
    .replace(/^\/api(?=\/|$)/, "");
}

export function getRateLimitPolicy(req) {
  const path = requestPath(req);

  if (path.startsWith("/auth/forgot-password/")) return "passwordReset";
  if (path === "/auth/login" || path === "/auth/login/options") return "login";
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
  if (path === "/transactions" || path.startsWith("/transactions/")) {
    return "transaction";
  }
  return "general";
}

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

export function apiRateLimit({ policies = RATE_LIMIT_POLICIES, now = Date.now } = {}) {
  return (req, res, next) => {
    const policyName = getRateLimitPolicy(req);
    const policy = policies[policyName];
    const timestamp = now();
    const key = `${policyName}:${clientKey(req)}`;
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

    res.setHeader("Retry-After", String(retryAfter));
    const error = new Error("Too many requests. Please try again later.");
    error.statusCode = 429;
    return next(error);
  };
}

export function resetRateLimitBuckets() {
  buckets.clear();
}
