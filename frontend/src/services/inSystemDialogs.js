const listeners = new Set();
let sequence = 0;

function requestDialog(options) {
  return new Promise((resolve) => {
    const request = { id: ++sequence, ...options, resolve };
    listeners.forEach((listener) => listener(request));
  });
}

export function confirmInSystem({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
  return requestDialog({ kind: "confirm", title, message, confirmLabel, cancelLabel, danger });
}

export function promptInSystem({ title, message, defaultValue = "", confirmLabel = "Continue", cancelLabel = "Cancel", danger = false, readOnly = false }) {
  return requestDialog({ kind: "prompt", title, message, defaultValue: String(defaultValue || ""), confirmLabel, cancelLabel, danger, readOnly });
}

export function subscribeInSystemDialogs(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
