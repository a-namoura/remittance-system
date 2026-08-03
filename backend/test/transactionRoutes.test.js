import assert from "node:assert/strict";
import test from "node:test";
import {
  MY_TRANSACTION_STATUSES,
  MY_TRANSACTION_VIEWS,
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
