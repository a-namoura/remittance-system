import mongoose from "mongoose";
import { getRemittanceContractAddress, getRemittanceProvider } from "./blockchain/remittanceClient.js";
import { BlockchainSyncState } from "./models/BlockchainSyncState.js";
import { incrementMetric, setMetric } from "./utils/metrics.js";

const DEFAULT_MAX_RECONCILIATION_LAG_BLOCKS = 25;
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 2_000;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function failed(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

function withTimeout(check, timeoutMs) {
  return Promise.race([
    check(),
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(failed("timed_out")), timeoutMs);
      timer.unref?.();
    }),
  ]);
}

export function createHealthChecks({
  mongo = mongoose,
  getProvider = getRemittanceProvider,
  getContractAddress = getRemittanceContractAddress,
  syncState = BlockchainSyncState,
  env = process.env,
} = {}) {
  async function checkMongoDB() {
    if (mongo.connection.readyState !== 1 || !mongo.connection.db) {
      return failed("disconnected");
    }
    try {
      await mongo.connection.db.admin().ping();
      return { ok: true };
    } catch {
      return failed("unreachable");
    }
  }

  async function checkBlockchain() {
    let provider;
    let contractAddress;
    try {
      provider = getProvider();
      contractAddress = getContractAddress();
    } catch {
      return failed("invalid_config");
    }

    try {
      const [network, latestBlock, code] = await Promise.all([
        provider.getNetwork(),
        provider.getBlockNumber(),
        provider.getCode(contractAddress),
      ]);
      const chainId = Number(network.chainId);
      if (!code || code === "0x") {
        return failed("contract_unavailable", { chainId, latestBlock });
      }
      return { ok: true, chainId, latestBlock };
    } catch {
      incrementMetric("rpc_failures_total", { operation: "health_check" });
      return failed("rpc_unreachable");
    }
  }

  async function checkReconciliation(blockchain) {
    if (String(env.TRANSACTION_RECONCILIATION_ENABLED || "true").toLowerCase() === "false") {
      return failed("disabled");
    }
    if (!blockchain.ok) return failed("blockchain_unavailable");

    const eventSyncEnabled = String(env.TRANSACTION_EVENT_SYNC_ENABLED || "true").toLowerCase() !== "false";
    if (!eventSyncEnabled) return { ok: true, eventSync: "disabled", lagBlocks: null };

    try {
      const key = `${blockchain.chainId}:${getContractAddress().toLowerCase()}`;
      const state = await syncState.findOne({ key }).lean();
      if (!state) return failed("not_initialized", { lagBlocks: null });

      const lagBlocks = Math.max(0, blockchain.latestBlock - state.lastProcessedBlock);
      setMetric("reconciliation_lag_blocks", lagBlocks);
      const maxLagBlocks = positiveInteger(
        env.HEALTH_RECONCILIATION_MAX_LAG_BLOCKS,
        DEFAULT_MAX_RECONCILIATION_LAG_BLOCKS
      );
      return {
        ok: lagBlocks <= maxLagBlocks,
        ...(lagBlocks > maxLagBlocks ? { reason: "lagging" } : {}),
        lagBlocks,
        maxLagBlocks,
        lastProcessedBlock: state.lastProcessedBlock,
      };
    } catch {
      return failed("state_unavailable", { lagBlocks: null });
    }
  }

  async function readiness() {
    const timeoutMs = positiveInteger(env.HEALTH_CHECK_TIMEOUT_MS, DEFAULT_HEALTH_CHECK_TIMEOUT_MS);
    const [mongodb, blockchain] = await Promise.all([
      withTimeout(checkMongoDB, timeoutMs),
      withTimeout(checkBlockchain, timeoutMs),
    ]);
    const reconciliation = await withTimeout(() => checkReconciliation(blockchain), timeoutMs);
    const checks = { mongodb, blockchain, reconciliation };
    return { ok: Object.values(checks).every((check) => check.ok), checks };
  }

  return { readiness };
}

export function liveHealth(req, res) {
  res.json({ ok: true, status: "live" });
}

export function createHealthHandlers(healthChecks = createHealthChecks()) {
  return {
    readyHealth: async (req, res) => {
      const result = await healthChecks.readiness();
      res.status(result.ok ? 200 : 503).json({ status: result.ok ? "ready" : "not_ready", ...result });
    },
    summaryHealth: async (req, res) => {
      const result = await healthChecks.readiness();
      res.json({ status: "API running", ready: result.ok, checks: result.checks });
    },
  };
}

export const { readyHealth, summaryHealth } = createHealthHandlers();
