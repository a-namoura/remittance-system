import assert from "node:assert/strict";
import test from "node:test";
import { getPasswordPolicyError } from "../src/controllers/authController.js";

test("password policy accepts a password meeting every requirement", () => {
  assert.equal(getPasswordPolicyError("ValidPass1!"), "");
});

test("password policy rejects a password below the minimum length", () => {
  assert.equal(
    getPasswordPolicyError("Pass1!a"),
    "Password must include at least 8 characters."
  );
});

test("password policy rejects a password without an uppercase letter", () => {
  assert.equal(
    getPasswordPolicyError("validpass1!"),
    "Password must include one uppercase letter."
  );
});

test("password policy rejects a password without a number", () => {
  assert.equal(
    getPasswordPolicyError("Validpass!"),
    "Password must include one number."
  );
});

test("password policy rejects a password without a special character", () => {
  assert.equal(
    getPasswordPolicyError("Validpass1"),
    "Password must include one special character."
  );
});
