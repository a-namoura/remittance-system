const counters = new Map();
const timings = new Map();

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

export function getMetricsSnapshot() {
  const decode = ([key, value]) => {
    const [name, labels] = JSON.parse(key);
    return { name, labels, ...(typeof value === "number" ? { value } : value) };
  };
  return { counters: [...counters.entries()].map(decode), timings: [...timings.entries()].map(decode) };
}

export function resetMetrics() {
  counters.clear();
  timings.clear();
}
