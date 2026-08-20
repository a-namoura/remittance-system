import crypto from "crypto";

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
export const IDEMPOTENCY_KEY_REUSED_MESSAGE =
  "This Idempotency-Key was already used with a different request.";
export const IDEMPOTENCY_REQUEST_IN_PROGRESS_MESSAGE =
  "A request with this Idempotency-Key is still processing.";

const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function readIdempotencyKey(req) {
  const key = String(req.get(IDEMPOTENCY_KEY_HEADER) || "").trim();
  if (!key) return null;
  if (!KEY_PATTERN.test(key)) {
    const error = new Error("Idempotency-Key must contain 1 to 255 visible ASCII characters.");
    error.statusCode = 400;
    throw error;
  }
  return key;
}

export function hashIdempotencyRequest(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

export async function acquireIdempotency({ model, userId, endpoint, key, requestHash, ttlMs = 24 * 60 * 60 * 1000 }) {
  if (!key) return { record: null, replay: null };
  try {
    const record = await model.create({
      userId, endpoint, key, requestHash, state: "processing",
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return { record, replay: null };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await model.findOne({ userId, endpoint, key }).lean();
    if (!existing) throw error;
    if (existing.requestHash !== requestHash) {
      const conflict = new Error(IDEMPOTENCY_KEY_REUSED_MESSAGE);
      conflict.statusCode = 409;
      throw conflict;
    }
    if (existing.state === "completed") {
      return { record: existing, replay: { statusCode: existing.statusCode, body: existing.responseBody } };
    }
    const inProgress = new Error(IDEMPOTENCY_REQUEST_IN_PROGRESS_MESSAGE);
    inProgress.statusCode = 409;
    inProgress.retryAfter = 1;
    throw inProgress;
  }
}

export async function completeIdempotency({ model, record, statusCode, responseBody, transactionId }) {
  if (!record) return;
  await model.updateOne(
    { _id: record._id, state: "processing" },
    { $set: { state: "completed", statusCode, responseBody, transactionId } }
  );
}

export async function releaseIdempotency({ model, record }) {
  if (!record) return;
  await model.deleteOne({ _id: record._id, state: "processing" });
}
