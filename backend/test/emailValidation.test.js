import assert from "node:assert/strict";
import test from "node:test";
import { isValidEmail } from "../src/controllers/authController.js";

test("email validation accepts a valid email address", () => {
  assert.equal(isValidEmail("person@example.com"), true);
});

test("email validation rejects malformed email addresses", () => {
  for (const email of [
    "personexample.com",
    "person@",
    "person@example",
    "person @example.com",
  ]) {
    assert.equal(isValidEmail(email), false, email);
  }
});
