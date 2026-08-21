import assert from "node:assert/strict";
import test from "node:test";
import { createCustodialWallet, decryptCustodialPrivateKey } from "../src/utils/custodialWallet.js";

test("custodial wallet keys are encrypted and decrypt to their generated address", async () => {
  const previousKey = process.env.CUSTODIAL_WALLET_ENCRYPTION_KEY;
  process.env.CUSTODIAL_WALLET_ENCRYPTION_KEY = "11".repeat(32);
  try {
    const generated = createCustodialWallet();
    assert.match(generated.address, /^0x[0-9a-fA-F]{40}$/);
    assert.ok(!generated.encryptedPrivateKey.includes("0x"));

    const privateKey = decryptCustodialPrivateKey(generated);
    const { Wallet } = await import("ethers");
    assert.equal(new Wallet(privateKey).address, generated.address);
  } finally {
    if (previousKey === undefined) delete process.env.CUSTODIAL_WALLET_ENCRYPTION_KEY;
    else process.env.CUSTODIAL_WALLET_ENCRYPTION_KEY = previousKey;
  }
});

test("custodial wallet creation rejects a missing encryption key", () => {
  const previousKey = process.env.CUSTODIAL_WALLET_ENCRYPTION_KEY;
  delete process.env.CUSTODIAL_WALLET_ENCRYPTION_KEY;
  try {
    assert.throws(() => createCustodialWallet(), /CUSTODIAL_WALLET_ENCRYPTION_KEY/);
  } finally {
    if (previousKey !== undefined) process.env.CUSTODIAL_WALLET_ENCRYPTION_KEY = previousKey;
  }
});
