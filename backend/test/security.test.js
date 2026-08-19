import assert from "node:assert/strict";
import test from "node:test";
import { redact } from "../src/utils/logging.js";
import { assertProductionExternalUrls, getFrontendOrigin } from "../src/config/security.js";

test("redact removes credentials and sensitive fields", () => {
  const value = redact({ authorization: "Bearer top-secret", uri: "mongodb://user:pass@db.example/remittance", resetToken: "abc", message: "GET /?token=abc" });
  assert.equal(value.authorization, "[REDACTED]");
  assert.equal(value.uri, "[REDACTED]");
  assert.equal(value.resetToken, "[REDACTED]");
  assert.match(value.message, /token=\[REDACTED\]/);
});

test("redact removes payment-link tokens embedded in URL paths", () => {
  const token = `req_${"a".repeat(64)}`;
  assert.equal(redact(`/send/${token}`), "/send/[REDACTED_LINK_TOKEN]");
});

test("production external URLs must use HTTPS", () => {
  const saved = { node: process.env.NODE_ENV, frontend: process.env.FRONTEND_URL, api: process.env.API_URL };
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_URL = "http://example.test";
  process.env.API_URL = "https://api.example.test";
  assert.throws(assertProductionExternalUrls, /FRONTEND_URL must use HTTPS/);
  process.env.FRONTEND_URL = "https://example.test";
  assert.equal(getFrontendOrigin(), "https://example.test");
  for (const [key, value] of Object.entries({ NODE_ENV: saved.node, FRONTEND_URL: saved.frontend, API_URL: saved.api })) value === undefined ? delete process.env[key] : process.env[key] = value;
});
