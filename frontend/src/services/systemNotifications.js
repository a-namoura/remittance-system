const listeners = new Set();
let sequence = 0;

export function publishSystemNotification(message, { variant = "info", durationMs = 4000 } = {}) {
  const normalized = String(message || "").trim();
  if (!normalized) return;
  const notification = { id: ++sequence, message: normalized, variant, durationMs };
  listeners.forEach((listener) => listener(notification));
}

export function subscribeToSystemNotifications(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
