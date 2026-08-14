import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAndValidatePhone, PHONE_MAX_DIGITS } from "../src/routes/userRoutes.js";

test("phone validation accepts international numbers within the digit limit", () => {
  assert.equal(normalizeAndValidatePhone(" +36201234567 "), "+36201234567");
  assert.equal(normalizeAndValidatePhone(`+${"1".repeat(PHONE_MAX_DIGITS)}`), `+${"1".repeat(PHONE_MAX_DIGITS)}`);
});

test("phone validation rejects missing country prefixes, formatting, and excessive digits", () => {
  for (const value of [
    "36201234567",
    "+36 20 123 4567",
    "+1234567",
    `+${"1".repeat(PHONE_MAX_DIGITS + 1)}`,
    "+0123456789",
  ]) {
    assert.throws(
      () => normalizeAndValidatePhone(value),
      (error) => error.statusCode === 400 && /international format/.test(error.message)
    );
  }
});
