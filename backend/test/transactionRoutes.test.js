import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import {
  MY_TRANSACTION_STATUSES,
  MY_TRANSACTION_VIEWS,
  createSendTransactionRouter,
  getEndOfUtcDay,
  validateMyTransactionsQuery,
} from "../src/routes/transactionRoutes.js";

test("my transactions query accepts every supported status and view", () => {
  for (const status of MY_TRANSACTION_STATUSES) {
    assert.doesNotThrow(() => validateMyTransactionsQuery({ status }));
  }

  for (const view of MY_TRANSACTION_VIEWS) {
    assert.doesNotThrow(() => validateMyTransactionsQuery({ view }));
  }
});

test("my transactions query rejects an invalid status with HTTP 400", () => {
  assert.throws(
    () => validateMyTransactionsQuery({ status: "processing" }),
    (error) => error.statusCode === 400 && error.message === "Invalid status query value."
  );
});

test("my transactions query rejects an invalid view with HTTP 400", () => {
  assert.throws(
    () => validateMyTransactionsQuery({ view: "outgoing" }),
    (error) => error.statusCode === 400 && error.message === "Invalid view query value."
  );
});

test("my transactions query accepts real YYYY-MM-DD date filters", () => {
  assert.doesNotThrow(() =>
    validateMyTransactionsQuery({ from: "2024-02-29", to: "2024-03-01" })
  );
});

test("my transactions query rejects invalid date filters with HTTP 400", () => {
  for (const query of [
    { from: "2024-02-30" },
    { to: "2024-13-01" },
    { from: "2024/01/01" },
    { to: "2024-1-01" },
  ]) {
    assert.throws(
      () => validateMyTransactionsQuery(query),
      (error) => error.statusCode === 400
    );
  }
});

test("my transactions query rejects date ranges where from is after to", () => {
  assert.throws(
    () => validateMyTransactionsQuery({ from: "2024-03-02", to: "2024-03-01" }),
    (error) =>
      error.statusCode === 400 &&
      error.message === "Invalid date range: from must be on or before to."
  );
});

test("my transactions query accepts positive whole page and limit values", () => {
  assert.doesNotThrow(() =>
    validateMyTransactionsQuery({ page: "2", limit: "50" })
  );
});

test("my transactions query rejects invalid page and limit values with HTTP 400", () => {
  for (const query of [
    { page: "0" },
    { page: "-1" },
    { page: "1.5" },
    { page: "two" },
    { limit: "0" },
    { limit: "-1" },
    { limit: "1.5" },
    { limit: "two" },
    { limit: "51" },
  ]) {
    assert.throws(
      () => validateMyTransactionsQuery(query),
      (error) => error.statusCode === 400
    );
  }
});

test("my transactions to date includes the final millisecond of the selected UTC day", () => {
  assert.equal(
    getEndOfUtcDay("2024-03-01").toISOString(),
    "2024-03-01T23:59:59.999Z"
  );
});

test("authenticated send returns 202 using injected verification and RPC dependencies within two seconds", async () => {
  const senderWallet = "0x1111111111111111111111111111111111111111";
  const receiverWallet = "0x2222222222222222222222222222222222222222";
  const calls = { verify: 0, submit: 0 };
  let createdPayload;
  const transaction = { _id: "transaction-1", status: "pending", assetSymbol: "BNB" };
  const quote = {
    _id: "quote-1", sourceAmount: 1.25, sourceCurrency: "BNB",
    destinationCurrency: "BNB", exchangeRate: 1, serviceFee: 0.0125,
    estimatedNetworkFee: 0.0001, recipientAmount: 1.25,
    expiresAt: new Date("2026-08-05T12:05:00.000Z"), consumedAt: null,
  };
  const walletModel = {
    findOne(query) {
      if (query.userId) return Promise.resolve({ address: senderWallet, isVerified: true });
      return { select: () => ({ lean: async () => ({ userId: "receiver-1" }) }) };
    },
  };
  const app = express();
  app.use(express.json());
  app.use(createSendTransactionRouter({
    protectMiddleware: (req, res, next) => {
      if (req.get("authorization") !== "Bearer test-token") return res.sendStatus(401);
      req.user = { _id: "sender-1" };
      next();
    },
    verifyPaymentCode: async ({ user, code }) => {
      calls.verify += 1;
      assert.equal(user._id, "sender-1");
      assert.equal(code, "123456");
    },
    submitRemittanceRpc: async (receiver, amount) => {
      calls.submit += 1;
      assert.equal(receiver, receiverWallet);
      assert.equal(amount, 1.25);
      return { txHash: "0xabc", submittedAt: "2026-08-05T12:00:00.000Z" };
    },
    getNativeBalance: async () => 5,
    updateWalletBalance: async () => {},
    walletModel,
    transactionModel: { create: async (payload) => { createdPayload = payload; return transaction; } },
    quoteModel: {
      findOne: async () => quote,
      findOneAndUpdate: async () => ({ ...quote, consumedAt: new Date() }),
      updateOne: async () => {},
    },
    logAttempt: async () => {},
    logResult: async () => {},
    createRequestKey: () => "request-1",
    rejectInFlightTransfer: async () => {},
    recordSubmission: async () => {},
    settleSubmission: () => {},
    markFailed: async () => {},
  }));

  const startedAt = performance.now();
  const response = await request(app)
    .post("/send")
    .set("Authorization", "Bearer test-token")
    .send({ receiverWallet, amountEth: "1.25", verificationCode: "123456", quoteId: "quote-1" });

  assert.ok(performance.now() - startedAt <= 2000);
  assert.equal(response.status, 202);
  assert.deepEqual(response.body, {
    ok: true,
    message: "Transaction submitted. Confirmation is processing.",
    transaction: {
      id: "transaction-1",
      status: "pending",
      txHash: "0xabc",
      failureReason: null,
      reconciliationError: null,
      blockchainResultReceivedAt: null,
      blockchainSyncedAt: null,
      blockchainSubmittedAt: "2026-08-05T12:00:00.000Z",
      assetSymbol: "BNB",
      quote: {
        quoteId: "quote-1",
        sourceAmount: 1.25,
        sourceCurrency: "BNB",
        destinationCurrency: "BNB",
        exchangeRate: 1,
        serviceFee: 0.0125,
        estimatedNetworkFee: 0.0001,
        recipientAmount: 1.25,
        expiresAt: "2026-08-05T12:05:00.000Z",
      },
    },
  });
  assert.deepEqual(calls, { verify: 1, submit: 1 });
  assert.equal(createdPayload.quoteId, "quote-1");
  assert.equal(createdPayload.appliedExchangeRate, 1);
  assert.equal(createdPayload.appliedServiceFee, 0.0125);
  assert.equal(createdPayload.appliedEstimatedNetworkFee, 0.0001);
  assert.equal(createdPayload.recipientAmount, 1.25);

  const missingQuoteResponse = await request(app)
    .post("/send")
    .set("Authorization", "Bearer test-token")
    .send({ receiverWallet, amountEth: "1.25", verificationCode: "123456" });
  assert.equal(missingQuoteResponse.status, 400);
});
