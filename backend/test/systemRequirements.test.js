import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { protect } from "../src/middleware/authMiddleware.js";
import { submitRemittance } from "../src/blockchain/remittanceClient.js";
import { User } from "../src/models/User.js";
import { Wallet } from "../src/models/Wallet.js";
import { Transaction } from "../src/models/Transaction.js";
import { AuditLog } from "../src/models/AuditLog.js";

test("SR-1 protected authentication accepts only a valid token for an active persisted session", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousFindById = User.findById;
  process.env.JWT_SECRET = "system-requirement-test-secret";

  const persistedUser = { _id: "user-1", sessionVersion: 3, isDisabled: false };
  User.findById = (id) => ({
    select: async () => {
      assert.equal(id, "user-1");
      return persistedUser;
    },
  });

  try {
    const token = jwt.sign(
      { userId: "user-1", sessionVersion: 3 },
      process.env.JWT_SECRET
    );
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status(code) { this.statusCode = code; return this; } };
    let nextError;

    await protect(req, res, (error) => { nextError = error; });

    assert.equal(nextError, undefined);
    assert.equal(req.user, persistedUser);
    assert.equal(res.statusCode, undefined);

    const missingReq = { headers: {} };
    const missingRes = { status(code) { this.statusCode = code; return this; } };
    await protect(missingReq, missingRes, (error) => { nextError = error; });
    assert.equal(missingRes.statusCode, 401);
    assert.equal(nextError.message, "Missing Authorization Bearer token");
  } finally {
    User.findById = previousFindById;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("SR-2 EVM/BSC transfers invoke the payable remittance smart contract and retain its hash", async () => {
  const receiver = "0x2222222222222222222222222222222222222222";
  const sender = "0x1111111111111111111111111111111111111111";
  const txHash = "0xabc123";
  let contractCall;
  const contract = {
    async transfer(actualReceiver, overrides) {
      contractCall = { receiver: actualReceiver, value: overrides.value };
      return {
        hash: txHash,
        wait: async () => ({ blockNumber: 42, status: 1 }),
      };
    },
  };

  const submission = await submitRemittance(receiver, "1.25", {
    getClient: () => ({ contract, wallet: { address: sender } }),
  });

  assert.equal(contractCall.receiver, receiver);
  assert.equal(contractCall.value, 1_250_000_000_000_000_000n);
  assert.equal(submission.txHash, txHash);
  assert.equal(submission.status, "pending");
  assert.deepEqual(await submission.waitForConfirmation(), {
    from: sender,
    to: receiver,
    value: "1.25",
    txHash,
    blockNumber: 42,
    status: 1,
  });
});

test("SR-2 rejects transfers back to the custodial blockchain signer", async () => {
  const signer = "0x1111111111111111111111111111111111111111";
  await assert.rejects(
    submitRemittance(signer, "1", {
      getClient: () => ({
        contract: { transfer: async () => assert.fail("must not broadcast") },
        wallet: { address: signer },
      }),
    }),
    /receiver cannot be the blockchain signer/i
  );
});

test("SR-3 user, wallet, transaction, and system-log data have persistent MongoDB models", () => {
  const requiredModels = [
    [User, "users", ["email", "passwordHash", "sessionVersion"]],
    [Wallet, "wallets", ["userId", "address", "isVerified"]],
    [Transaction, "transactions", ["senderWallet", "receiverWallet", "amount", "status", "txHash"]],
    [AuditLog, "auditlogs", ["action", "category", "outcome", "metadata"]],
  ];

  for (const [model, collectionName, fields] of requiredModels) {
    assert.equal(model.db.base.constructor.name, "Mongoose");
    assert.equal(model.collection.collectionName, collectionName);
    for (const field of fields) assert.ok(model.schema.path(field), `${model.modelName}.${field}`);
    assert.equal(model.schema.options.timestamps, true);
  }
});
