import assert from "node:assert/strict";
import test from "node:test";
import {
  MY_TRANSACTION_STATUSES,
  MY_TRANSACTION_VIEWS,
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
