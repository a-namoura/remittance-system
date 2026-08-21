import assert from "node:assert/strict";
import test from "node:test";
import { createHealthChecks, createHealthHandlers, liveHealth } from "../src/health.js";

function dependencies(overrides = {}) {
  const state = overrides.state === undefined ? { lastProcessedBlock: 990 } : overrides.state;
  return {
    mongo: overrides.mongo || {
      connection: { readyState: 1, db: { admin: () => ({ ping: async () => ({ ok: 1 }) }) } },
    },
    getProvider: () => overrides.provider || {
      getNetwork: async () => ({ chainId: 97n }),
      getBlockNumber: async () => 1000,
      getCode: async () => "0x6000",
    },
    getContractAddress: () => "0x0000000000000000000000000000000000000001",
    syncState: { findOne: () => ({ lean: async () => state }) },
    env: overrides.env || {},
  };
}

test("liveness only reports process health", () => {
  let response;
  liveHealth({}, { json: (body) => { response = body; } });
  assert.deepEqual(response, { ok: true, status: "live" });
});

test("readiness returns 503 while the backward-compatible summary remains 200", async () => {
  const result = { ok: false, checks: { mongodb: { ok: false, reason: "disconnected" } } };
  const { readyHealth, summaryHealth } = createHealthHandlers({ readiness: async () => result });
  const responses = [];
  const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { responses.push({ statusCode: this.statusCode, body }); },
  });
  await readyHealth({}, response());
  await summaryHealth({}, response());
  assert.equal(responses[0].statusCode, 503);
  assert.equal(responses[0].body.status, "not_ready");
  assert.equal(responses[1].statusCode, 200);
  assert.equal(responses[1].body.status, "API running");
  assert.equal(responses[1].body.ready, false);
});

test("readiness succeeds when database, RPC, contract, and reconciliation are healthy", async () => {
  const result = await createHealthChecks(dependencies()).readiness();
  assert.equal(result.ok, true);
  assert.deepEqual(result.checks.mongodb, { ok: true });
  assert.equal(result.checks.blockchain.chainId, 97);
  assert.equal(result.checks.reconciliation.lagBlocks, 10);
});

test("readiness fails safely when infrastructure is unavailable", async () => {
  const result = await createHealthChecks(dependencies({
    mongo: { connection: { readyState: 0 } },
    provider: {
      getNetwork: async () => ({ chainId: 97n }),
      getBlockNumber: async () => 1000,
      getCode: async () => "0x",
    },
  })).readiness();
  assert.equal(result.ok, false);
  assert.deepEqual(result.checks.mongodb, { ok: false, reason: "disconnected" });
  assert.equal(result.checks.blockchain.reason, "contract_unavailable");
  assert.equal(result.checks.reconciliation.reason, "blockchain_unavailable");
  assert.equal(JSON.stringify(result).includes("0000000000000000000000000000000000000001"), false);
});

test("readiness reports excessive reconciliation lag", async () => {
  const result = await createHealthChecks(dependencies({
    state: { lastProcessedBlock: 900 },
    env: { HEALTH_RECONCILIATION_MAX_LAG_BLOCKS: "25" },
  })).readiness();
  assert.equal(result.ok, false);
  assert.deepEqual(result.checks.reconciliation, {
    ok: false,
    reason: "lagging",
    lagBlocks: 100,
    maxLagBlocks: 25,
    lastProcessedBlock: 900,
  });
});

test("readiness identifies missing and invalid blockchain configuration without echoing it", async () => {
  const secret = "https://user:password@example.invalid/rpc";
  const deps = dependencies();
  deps.getProvider = () => { throw new Error(secret); };
  const result = await createHealthChecks(deps).readiness();
  assert.equal(result.checks.blockchain.reason, "invalid_config");
  assert.equal(JSON.stringify(result).includes(secret), false);
});
