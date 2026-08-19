const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[_-]?key|code|private[_-]?key|mongodb(?:_uri)?|uri)/i;

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
  for (const method of ["log", "info", "warn", "error", "debug"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => original(...args.map(redact));
  }
}
