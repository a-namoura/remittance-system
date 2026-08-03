import assert from "node:assert/strict";
import test from "node:test";
import { allowBodyFields, allowQueryFields } from "../src/middleware/allowFields.js";

function runMiddleware(middleware, req) {
  let nextError;
  middleware(req, {}, (err) => {
    nextError = err;
  });
  return nextError;
}

test("allowBodyFields permits allowed body fields", () => {
  const error = runMiddleware(
    allowBodyFields(["email", "password"]),
    { body: { email: "user@example.com", password: "ValidPass1!" } }
  );

  assert.equal(error, undefined);
});

test("allowBodyFields rejects unexpected body fields with HTTP 400", () => {
  const error = runMiddleware(
    allowBodyFields(["email"]),
    { body: { email: "user@example.com", role: "admin" } }
  );

  assert.equal(error.statusCode, 400);
  assert.equal(error.message, "Unexpected body field: role.");
});

test("allowQueryFields permits allowed query fields", () => {
  const error = runMiddleware(
    allowQueryFields(["page", "limit"]),
    { query: { page: "1", limit: "20" } }
  );

  assert.equal(error, undefined);
});

test("allowQueryFields rejects unexpected query fields with HTTP 400", () => {
  const error = runMiddleware(
    allowQueryFields(["page"]),
    { query: { page: "1", sort: "createdAt" } }
  );

  assert.equal(error.statusCode, 400);
  assert.equal(error.message, "Unexpected query field: sort.");
});
