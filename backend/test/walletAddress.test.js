import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidEvmAddress,
  normalizeEvmAddress,
} from "../src/utils/walletAddress.js";

const validAddress = "0x52908400098527886E0F7030069857D2E4169EE7";

test("wallet address validation accepts and normalizes a valid EVM address", () => {
  assert.equal(isValidEvmAddress(validAddress), true);
  assert.equal(
    normalizeEvmAddress(validAddress),
    "0x52908400098527886e0f7030069857d2e4169ee7"
  );
});

test("wallet address validation rejects malformed addresses", () => {
  for (const address of [
    "",
    "0x1234",
    "0x52908400098527886E0F7030069857D2E4169EEZ",
    "0x0000000000000000000000000000000000000000",
  ]) {
    assert.equal(isValidEvmAddress(address), false, address);
    assert.equal(normalizeEvmAddress(address), "", address);
  }
});

test("normalization identifies self-transfers despite address casing", () => {
  const senderWallet = normalizeEvmAddress(validAddress);
  const receiverWallet = normalizeEvmAddress(validAddress.toLowerCase());

  assert.equal(senderWallet, receiverWallet);
});
