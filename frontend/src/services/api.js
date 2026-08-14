
import { clearAuthToken, getAuthToken } from "./session.js";
import { emitRequestEvent } from "./requestEvents.js";

import { getUserErrorMessage } from "../utils/userError.js";
const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

if (import.meta.env.PROD && !String(API_URL).startsWith("https://")) {
  throw new Error("Production VITE_API_URL must use HTTPS.");
}

const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 30000;
const MUTATION_TIMEOUT_MS =
  Number(import.meta.env.VITE_API_MUTATION_TIMEOUT_MS) || 120000;
let requestSequence = 0;

function getRequestTimeoutMs(method, timeoutMs) {
  const explicitTimeout = Number(timeoutMs);
  if (Number.isFinite(explicitTimeout) && explicitTimeout > 0) {
    return explicitTimeout;
  }

  const normalizedMethod = String(method || "GET").toUpperCase();
  return ["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)
    ? DEFAULT_TIMEOUT_MS
    : MUTATION_TIMEOUT_MS;
}

function normalizePath(path) {
  const value = String(path || "");
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function getBaseUrl() {
  return String(API_URL || "").replace(/\/+$/, "");
}

function buildHeaders({ body, token }) {
  const headers = {
    Accept: "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (!(body instanceof FormData) && body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => "");
  return text ? { message: text } : {};
}

function toRequestBody(body) {
  if (body === undefined || body === null) return undefined;
  if (body instanceof FormData) return body;
  return JSON.stringify(body);
}

export async function apiRequest(
  path,
  {
    method = "GET",
    body,
    token,
    signal,
    trackRequest = true,
    timeoutMs,
  } = {}
) {
  const requestId = ++requestSequence;
  const finalToken = token ?? getAuthToken();
  const shouldTrackRequest = Boolean(trackRequest);
  const controller = new AbortController();
  const requestTimeoutMs = getRequestTimeoutMs(method, timeoutMs);
  let didTimeOut = false;
  const timeout = globalThis.setTimeout(() => {
    didTimeOut = true;
    controller.abort();
  }, requestTimeoutMs);

  const abortFromSignal = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromSignal, { once: true });
    }
  }

  try {
    if (shouldTrackRequest) {
      emitRequestEvent({
        type: "start",
        requestId,
        path: normalizePath(path),
        method: String(method || "GET").toUpperCase(),
      });
    }

    const response = await fetch(`${getBaseUrl()}${normalizePath(path)}`, {
      method,
      headers: buildHeaders({ body, token: finalToken }),
      body: toRequestBody(body),
      signal: controller.signal,
    });

    const data = await parseResponseBody(response);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // A request made with an older token can finish after a new login has
        // stored a fresh one. Only invalidate the token that was rejected.
        clearAuthToken(finalToken);
      }

      const message = response.status === 401
        ? finalToken
          ? "Your session has expired. Please sign in again."
          : "Authentication failed. Please check your details and try again."
        : response.status === 403
          ? "You do not have permission to perform this action."
          : "The request could not be completed.";
      const error = new Error(message);
      error.status = response.status;
      error.isApiError = true;
      // Keep only a stable machine code. Backend messages and payloads must never
      // become browser-visible notification content.
      error.code = typeof data?.code === "string" ? data.code : "REQUEST_FAILED";
      error.alreadyReported = true;
      if (shouldTrackRequest) {
        emitRequestEvent({
          type: "error",
          requestId,
          path: normalizePath(path),
          method: String(method || "GET").toUpperCase(),
          message,
          status: response.status,
        });
      }
      throw error;
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError" && didTimeOut) {
      const timeoutError = new Error("Request timed out. Please try again.");
      if (shouldTrackRequest) {
        emitRequestEvent({
          type: "error",
          requestId,
          path: normalizePath(path),
          method: String(method || "GET").toUpperCase(),
          message: timeoutError.message,
        });
      }
      throw timeoutError;
    }

    if (error?.name === "AbortError") {
      throw error;
    }

    if (shouldTrackRequest && !error?.alreadyReported) {
      emitRequestEvent({
        type: "error",
        requestId,
        path: normalizePath(path),
        method: String(method || "GET").toUpperCase(),
        message: getUserErrorMessage(error, "Network request failed."),
        status: error?.status,
      });
    }

    throw error;
  } finally {
    if (shouldTrackRequest) {
      emitRequestEvent({
        type: "end",
        requestId,
        path: normalizePath(path),
        method: String(method || "GET").toUpperCase(),
      });
    }

    globalThis.clearTimeout(timeout);
    if (signal) {
      signal.removeEventListener("abort", abortFromSignal);
    }
  }
}
