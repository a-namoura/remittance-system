import assert from "node:assert/strict";
import test from "node:test";
import { requireAdmin } from "../src/middleware/authMiddleware.js";

function runMiddleware(req) {
  let statusCode;
  let nextError;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
  };

  requireAdmin(req, res, (err) => {
    nextError = err;
  });

  return { statusCode, nextError };
}

test("requireAdmin rejects unauthenticated requests with HTTP 401", () => {
  const { statusCode, nextError } = runMiddleware({});

  assert.equal(statusCode, 401);
  assert.equal(nextError.message, "Not authenticated");
});

test("requireAdmin rejects non-admin users with HTTP 403", () => {
  const { statusCode, nextError } = runMiddleware({ user: { role: "user" } });

  assert.equal(statusCode, 403);
  assert.equal(nextError.message, "Admin access only");
});

test("requireAdmin allows admin users", () => {
  const { statusCode, nextError } = runMiddleware({ user: { role: "admin" } });

  assert.equal(statusCode, undefined);
  assert.equal(nextError, undefined);
});
