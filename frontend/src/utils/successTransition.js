import { useCallback, useEffect, useRef, useState } from "react";

export const SUCCESS_TRANSITION_DURATION_MS = 2000;

export function useSuccessTransitionMessage() {
  const [message, setMessage] = useState("");
  const timeoutRef = useRef(null);

  const showSuccessTransition = useCallback((nextMessage) => {
    const normalizedMessage = String(nextMessage || "").trim();
    if (!normalizedMessage) return;

    if (timeoutRef.current) {
      globalThis.clearTimeout(timeoutRef.current);
    }

    setMessage(normalizedMessage);
    timeoutRef.current = globalThis.setTimeout(() => {
      setMessage("");
      timeoutRef.current = null;
    }, SUCCESS_TRANSITION_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        globalThis.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [message, showSuccessTransition];
}
