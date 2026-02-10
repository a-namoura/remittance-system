
import { clearAuthToken, getAuthToken } from "./session.js";

const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 15000;

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
  { method = "GET", body, token, signal } = {}
) {
  const finalToken = token ?? getAuthToken();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    DEFAULT_TIMEOUT_MS
  );

  const abortFromSignal = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromSignal, { once: true });
    }
  }

  try {
    const response = await fetch(`${getBaseUrl()}${normalizePath(path)}`, {
      method,
      headers: buildHeaders({ body, token: finalToken }),
      body: toRequestBody(body),
      signal: controller.signal,
    });

    const data = await parseResponseBody(response);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuthToken();
      }

      const message = data.message || `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    if (signal) {
      signal.removeEventListener("abort", abortFromSignal);
    }
  }
}
