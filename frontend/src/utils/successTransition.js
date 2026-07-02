import { useCallback, useEffect, useRef, useState } from "react";

export const SUCCESS_TRANSITION_DURATION_MS = 2000;

export function useTransitionNotification(defaultVariant = "success") {
  const [notification, setNotification] = useState({
    message: "",
    variant: defaultVariant,
  });
  const timeoutRef = useRef(null);

  const showNotification = useCallback(
    (nextMessage, options = {}) => {
      const normalizedMessage = String(nextMessage || "").trim();
      if (!normalizedMessage) return;

      if (timeoutRef.current) {
        globalThis.clearTimeout(timeoutRef.current);
      }

      setNotification({
        message: normalizedMessage,
        variant: options.variant || defaultVariant,
      });
      timeoutRef.current = globalThis.setTimeout(() => {
        setNotification((current) => ({ ...current, message: "" }));
        timeoutRef.current = null;
      }, SUCCESS_TRANSITION_DURATION_MS);
    },
    [defaultVariant]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        globalThis.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [notification, showNotification];
}

export function useSuccessTransitionMessage() {
  const [notification, showNotification] = useTransitionNotification("success");
  const showSuccessTransition = useCallback(
    (nextMessage) => showNotification(nextMessage, { variant: "success" }),
    [showNotification]
  );

  return [notification.message, showSuccessTransition];
}
