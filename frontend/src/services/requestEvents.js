const REQUEST_EVENT_NAME = "remittance:api-request";

export function emitRequestEvent(detail) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(REQUEST_EVENT_NAME, {
      detail: {
        ...detail,
        timestamp: Date.now(),
      },
    })
  );
}

export function subscribeToRequestEvents(handler) {
  if (typeof window === "undefined" || typeof handler !== "function") {
    return () => {};
  }

  const listener = (event) => {
    handler(event.detail || {});
  };

  window.addEventListener(REQUEST_EVENT_NAME, listener);
  return () => window.removeEventListener(REQUEST_EVENT_NAME, listener);
}

