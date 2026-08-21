const counters = new Map();
const timings = new Map();
const gauges = new Map();
const PUBLIC_LABELS = new Set(["method", "route", "status", "outcome", "flow", "asset", "operation", "policy"]);

export function incrementMetric(name, labels = {}, value = 1) {
  const key = JSON.stringify([name, labels]);
  counters.set(key, (counters.get(key) || 0) + value);
}

export function observeMetric(name, milliseconds, labels = {}) {
  const key = JSON.stringify([name, labels]);
  const current = timings.get(key) || { count: 0, totalMs: 0, maxMs: 0 };
  current.count += 1;
  current.totalMs += milliseconds;
  current.maxMs = Math.max(current.maxMs, milliseconds);
  timings.set(key, current);
}

export function setMetric(name, value, labels = {}) {
  if (!Number.isFinite(value)) return;
  gauges.set(JSON.stringify([name, labels]), value);
}

export function getMetricsSnapshot() {
  const decode = ([key, value]) => {
    const [name, labels] = JSON.parse(key);
    return { name, labels, ...(typeof value === "number" ? { value } : value) };
  };
  return {
    counters: [...counters.entries()].map(decode),
    timings: [...timings.entries()].map(decode),
    gauges: [...gauges.entries()].map(decode),
  };
}

export function getPublicMetricsSnapshot() {
  const sanitize = (metric) => ({
    ...metric,
    labels: Object.fromEntries(
      Object.entries(metric.labels || {}).filter(([key]) => PUBLIC_LABELS.has(key))
    ),
  });
  const snapshot = getMetricsSnapshot();
  return {
    counters: snapshot.counters.map(sanitize),
    timings: snapshot.timings.map(sanitize),
    gauges: snapshot.gauges.map(sanitize),
  };
}

export function resetMetrics() {
  counters.clear();
  timings.clear();
  gauges.clear();
}
