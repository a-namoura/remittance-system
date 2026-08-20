import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

const logContext = new AsyncLocalStorage();
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[_-]?key|code|private[_-]?key|mongodb(?:_uri)?|uri|email|phone|wallet|address|ip|useragent)/i;

export function redact(value) {
  if (value instanceof Error) return { name: value.name, message: redact(String(value.message)) };
  if (typeof value === "string") return value
    .replace(/(mongodb(?:\+srv)?:\/\/)([^@\s]+)@/gi, "$1[REDACTED]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:req|snd)_[A-Fa-f0-9]{64}\b/g, "[REDACTED_LINK_TOKEN]")
    .replace(/([?&](?:token|resetToken|code|api[_-]?key|secret)=[^&#\s]+)/gi, (match) => match.replace(/=.*/, "=[REDACTED]"));
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(item)]));
  return value;
}

export function installRedactedConsole() {
  if (console.__structuredLoggingInstalled) return;
  Object.defineProperty(console, "__structuredLoggingInstalled", { value: true });
  for (const method of ["log", "info", "warn", "error", "debug"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      const [first, ...rest] = args;
      const fields = first && typeof first === "object" && !(first instanceof Error)
        ? { ...first, ...(rest.length ? { details: rest } : {}) }
        : { message: first == null ? "" : String(first), ...(rest.length ? { details: rest } : {}) };
      original(JSON.stringify(redact({
        timestamp: new Date().toISOString(),
        level: method === "log" ? "info" : method,
        ...(logContext.getStore() || {}),
        ...fields,
      })));
    };
  }
}

export function runWithLogContext(context, callback) {
  return logContext.run(redact(context), callback);
}

export function addLogContext(context) {
  const current = logContext.getStore();
  if (current) Object.assign(current, redact(context));
}

export function createRequestContext(req, res, next) {
  const safeId = (value) => /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
  const requestId = safeId(String(req.get("x-request-id") || "").trim()) || crypto.randomUUID();
  const correlationId = safeId(String(req.get("x-correlation-id") || "").trim()) || requestId;
  req.requestId = requestId;
  req.correlationId = correlationId;
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Correlation-Id", correlationId);
  runWithLogContext({ requestId, correlationId }, next);
}
