import assert from "node:assert/strict";
import test from "node:test";
import {
  rejectInvalidTransferAmount,
  rejectOutOfRangeTransferAmount,
} from "../src/utils/transferLimits.js";
import { getNativeAssetSymbol } from "../src/utils/currency.js";

function createResponse() {
  return {
    statusCode: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
}

function runAmountValidation(amount) {
  const res = createResponse();
  return { res, validate: () => rejectInvalidTransferAmount(res, amount) };
}

test("transfer limits allow valid amounts within the configured range", () => {
  const previousMin = process.env.MIN_TRANSFER_ETH;
  const previousMax = process.env.MAX_TRANSFER_ETH;
  process.env.MIN_TRANSFER_ETH = "0.01";
  process.env.MAX_TRANSFER_ETH = "10";

  try {
    const res = createResponse();
    assert.doesNotThrow(() => rejectOutOfRangeTransferAmount(res, 1));
    assert.equal(res.statusCode, undefined);
  } finally {
    previousMin === undefined
      ? delete process.env.MIN_TRANSFER_ETH
      : (process.env.MIN_TRANSFER_ETH = previousMin);
    previousMax === undefined
      ? delete process.env.MAX_TRANSFER_ETH
      : (process.env.MAX_TRANSFER_ETH = previousMax);
  }
});

test("positive amount validation accepts valid amounts", () => {
  for (const amount of [0.01, 1, 2.5]) {
    const { res, validate } = runAmountValidation(amount);
    assert.doesNotThrow(validate);
    assert.equal(res.statusCode, undefined);
  }
});

for (const [name, amount] of [
  ["zero", 0],
  ["negative", -1],
  ["non-numeric", "not-a-number"],
]) {
  test(`positive amount validation rejects ${name} amounts`, () => {
    const { res, validate } = runAmountValidation(amount);

    assert.throws(validate, /amountEth must be a positive number\./);
    assert.equal(res.statusCode, 400);
  });
}

test("transfer limits reject amounts above the configured maximum", () => {
  const previousMax = process.env.MAX_TRANSFER_ETH;
  process.env.MAX_TRANSFER_ETH = "10";

  try {
    const res = createResponse();
    assert.throws(
      () => rejectOutOfRangeTransferAmount(res, 10.01),
      new RegExp(`amountEth must be at most 10 ${getNativeAssetSymbol()}\\.`)
    );
    assert.equal(res.statusCode, 400);
  } finally {
    previousMax === undefined
      ? delete process.env.MAX_TRANSFER_ETH
      : (process.env.MAX_TRANSFER_ETH = previousMax);
  }
});
