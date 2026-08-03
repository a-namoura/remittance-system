import assert from "node:assert/strict";
import test from "node:test";
import { sendTransaction } from "../src/controllers/transactionController.js";
import { rejectOutOfRangeTransferAmount } from "../src/utils/transferLimits.js";

function createResponse() {
  return {
    statusCode: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
}

async function runAmountValidation(amountEth) {
  const res = createResponse();
  let nextError;

  await sendTransaction(
    { body: { receiver: "0x52908400098527886E0F7030069857D2E4169EE7", amountEth } },
    res,
    (err) => {
    nextError = err;
    }
  );

  return { res, nextError };
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

for (const [name, amount] of [
  ["zero", 0],
  ["negative", -1],
  ["non-numeric", "not-a-number"],
]) {
  test(`transfer requests reject ${name} amounts`, async () => {
    const { res, nextError } = await runAmountValidation(amount);

    assert.equal(res.statusCode, 400);
    assert.ok(nextError);
  });
}

test("transfer limits reject amounts above the configured maximum", () => {
  const previousMax = process.env.MAX_TRANSFER_ETH;
  process.env.MAX_TRANSFER_ETH = "10";

  try {
    const res = createResponse();
    assert.throws(
      () => rejectOutOfRangeTransferAmount(res, 10.01),
      /amountEth must be at most 10 ETH\./
    );
    assert.equal(res.statusCode, 400);
  } finally {
    previousMax === undefined
      ? delete process.env.MAX_TRANSFER_ETH
      : (process.env.MAX_TRANSFER_ETH = previousMax);
  }
});
