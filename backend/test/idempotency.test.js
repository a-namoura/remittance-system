import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireIdempotency,
  completeIdempotency,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from "../src/utils/idempotency.js";

test("request hashes are stable across object key order", () => {
  assert.equal(
    hashIdempotencyRequest({ amount: 2, receiver: "0xabc" }),
    hashIdempotencyRequest({ receiver: "0xabc", amount: 2 })
  );
});

test("Idempotency-Key validation accepts visible ASCII and rejects oversized keys", () => {
  assert.equal(readIdempotencyKey({ get: () => "retry-123" }), "retry-123");
  assert.throws(
    () => readIdempotencyKey({ get: () => "x".repeat(256) }),
    (error) => error.statusCode === 400
  );
});

test("the first request atomically owns a key and persists its response", async () => {
  const updates = [];
  const record = { _id: "idem-1" };
  const model = {
    create: async () => record,
    updateOne: async (...args) => updates.push(args),
  };
  const acquired = await acquireIdempotency({
    model, userId: "user-1", endpoint: "POST /send", key: "key-1", requestHash: "hash-1",
  });
  assert.equal(acquired.record, record);
  assert.equal(acquired.replay, null);

  await completeIdempotency({
    model, record, statusCode: 202, responseBody: { ok: true }, transactionId: "tx-1",
  });
  assert.deepEqual(updates[0], [
    { _id: "idem-1", state: "processing" },
    { $set: { state: "completed", statusCode: 202, responseBody: { ok: true }, transactionId: "tx-1" } },
  ]);
});

test("a completed duplicate replays the persisted result", async () => {
  const duplicate = Object.assign(new Error("duplicate"), { code: 11000 });
  const model = {
    create: async () => { throw duplicate; },
    findOne: () => ({ lean: async () => ({ requestHash: "hash-1", state: "completed", statusCode: 202, responseBody: { transaction: { id: "tx-1" } } }) }),
  };
  const result = await acquireIdempotency({
    model, userId: "user-1", endpoint: "POST /send", key: "key-1", requestHash: "hash-1",
  });
  assert.deepEqual(result.replay, { statusCode: 202, body: { transaction: { id: "tx-1" } } });
});

test("a reused key with a different request is rejected", async () => {
  const model = {
    create: async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); },
    findOne: () => ({ lean: async () => ({ requestHash: "other-hash", state: "completed" }) }),
  };
  await assert.rejects(
    acquireIdempotency({ model, userId: "user-1", endpoint: "POST /send", key: "key-1", requestHash: "hash-1" }),
    (error) => error.statusCode === 409 && /different request/.test(error.message)
  );
});

test("a concurrent duplicate is rejected without taking ownership", async () => {
  const model = {
    create: async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); },
    findOne: () => ({ lean: async () => ({ requestHash: "hash-1", state: "processing" }) }),
  };
  await assert.rejects(
    acquireIdempotency({ model, userId: "user-1", endpoint: "POST /send", key: "key-1", requestHash: "hash-1" }),
    (error) => error.statusCode === 409 && error.retryAfter === 1
  );
});
