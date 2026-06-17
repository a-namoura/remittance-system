import { useEffect, useState } from "react";
import { subscribeToRequestEvents } from "../services/requestEvents.js";

export default function GlobalRequestFeedback() {
  const [activeRequests, setActiveRequests] = useState(0);
  const [routeLoadStarted, setRouteLoadStarted] = useState(false);
  const [routeLoadCompleted, setRouteLoadCompleted] = useState(false);

  useEffect(() => {
    function isPageLoadingEvent(event) {
      return String(event?.method || "GET").toUpperCase() === "GET";
    }

    return subscribeToRequestEvents((event) => {
      if (event.type === "start") {
        if (!isPageLoadingEvent(event)) return;
        setRouteLoadStarted(true);
        setActiveRequests((current) => current + 1);
        return;
      }

      if (event.type === "end") {
        if (!isPageLoadingEvent(event)) return;
        setRouteLoadCompleted(true);
        setActiveRequests((current) => Math.max(0, current - 1));
      }
    });
  }, []);

  const showLoading = routeLoadStarted && !routeLoadCompleted && activeRequests > 0;

  if (!showLoading) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-indigo-700 shadow-sm ring-1 ring-indigo-100">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 animate-spin"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
        </svg>
      </span>
    </div>
  );
}
