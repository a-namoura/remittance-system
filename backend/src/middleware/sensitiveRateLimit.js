const buckets = new Map();

export function sensitiveRateLimit({ windowMs = 60_000, max = 20 } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const actor = String(req.user?._id || req.ip || "unknown");
    const key = `${actor}:${req.route?.path || req.path}`;
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    if (bucket.count <= max) return next();
    res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429);
    const error = new Error("Too many payment-link requests. Please try again later.");
    error.statusCode = 429;
    return next(error);
  };
}
