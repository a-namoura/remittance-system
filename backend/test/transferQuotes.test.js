import assert from "node:assert/strict";
import test from "node:test";
import { calculateTransferQuote } from "../src/utils/transferQuotes.js";

test("same-currency quote includes an immutable fee and recipient breakdown", () => {
  const quote = calculateTransferQuote({ sourceAmount: 2, sourceCurrency: "BNB", destinationCurrency: "BNB" });
  assert.equal(quote.exchangeRate, 1);
  assert.equal(quote.serviceFee, 0.02);
  assert.equal(quote.estimatedNetworkFee, 0.0001);
  assert.equal(quote.recipientAmount, 2);
});

test("quote rejects a non-native source currency", () => {
  assert.throws(
    () => calculateTransferQuote({ sourceAmount: 2, sourceCurrency: "USD", destinationCurrency: "BNB" }),
    (error) => error.statusCode === 400
  );
});
