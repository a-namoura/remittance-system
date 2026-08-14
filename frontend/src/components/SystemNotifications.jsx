import { useEffect, useState } from "react";
import { subscribeToSystemNotifications } from "../services/systemNotifications.js";

const TONE_CLASS = {
  error: "app-page-error",
  success: "app-page-success",
  info: "app-page-info",
  warning: "app-page-warning",
};

export default function SystemNotifications() {
  const [notification, setNotification] = useState(null);

  useEffect(() => subscribeToSystemNotifications(setNotification), []);
  useEffect(() => {
    if (!notification) return undefined;
    const timer = globalThis.setTimeout(() => setNotification(null), notification.durationMs);
    return () => globalThis.clearTimeout(timer);
  }, [notification]);

  if (!notification) return null;
  const isError = notification.variant === "error";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:top-6">
      <div role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"} className={`${TONE_CLASS[notification.variant] || TONE_CLASS.info} pointer-events-auto flex w-full max-w-xl items-start gap-3 shadow-lg`}>
        <span aria-hidden="true" className="font-bold">{isError ? "!" : notification.variant === "success" ? "✓" : "i"}</span>
        <span className="flex-1">{notification.message}</span>
        <button type="button" onClick={() => setNotification(null)} aria-label="Dismiss notification" className="text-current opacity-60 hover:opacity-100">×</button>
      </div>
    </div>
  );
}
