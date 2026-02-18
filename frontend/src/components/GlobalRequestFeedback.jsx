import { useEffect, useState } from "react";
import { subscribeToRequestEvents } from "../services/requestEvents.js";

const ERROR_AUTO_HIDE_MS = 7000;

export default function GlobalRequestFeedback() {
  const [activeRequests, setActiveRequests] = useState(0);
  const [routeLoadStarted, setRouteLoadStarted] = useState(false);
  const [routeLoadCompleted, setRouteLoadCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
        return;
      }

      if (event.type === "error") {
        setErrorMessage(String(event.message || "Something went wrong. Please try again."));
      }
    });
  }, []);

  useEffect(() => {
    if (!errorMessage) return;

    const timeout = globalThis.setTimeout(() => {
      setErrorMessage("");
    }, ERROR_AUTO_HIDE_MS);

    return () => globalThis.clearTimeout(timeout);
  }, [errorMessage]);

  const showLoading = routeLoadStarted && !routeLoadCompleted && activeRequests > 0;

  if (!showLoading && !errorMessage) {
    return null;
  }

  return (
    <>
      {showLoading && (
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
      )}

      {errorMessage && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[80] px-4 sm:top-16">
          <div className="mx-auto w-full max-w-2xl">
            <div className="pointer-events-auto rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-700">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8.5 8.5 15.5 15.5M15.5 8.5 8.5 15.5" />
                  </svg>
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800">
                    Connection issue
                  </p>
                  <p className="mt-0.5 text-xs text-red-700">{errorMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage("")}
                  className="rounded-full border border-red-300 bg-white px-2 py-1 text-[11px] font-medium text-red-700 transition hover:bg-red-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
