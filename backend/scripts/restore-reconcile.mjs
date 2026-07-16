import mongoose from "mongoose";
import { reconcileTransactions } from "../src/blockchain/transactionReconciliation.js";

const uri = process.env.RESTORE_MONGODB_URI;
if (!uri || !["restore-only", "receipt-only"].includes(process.env.RESTORE_CONFIRM)) {
  throw new Error("Set RESTORE_MONGODB_URI and RESTORE_CONFIRM=restore-only (or receipt-only for a completed restore).");
}
const target = new URL(uri);
if (!target.username || !target.password || (target.protocol !== "mongodb+srv:" && target.searchParams.get("tls") !== "true")) {
  throw new Error("Restore reconciliation requires an authenticated TLS MongoDB URI.");
}
if (!process.env.BSC_TESTNET_RPC_URL || !process.env.REM_CONTRACT_ADDRESS) {
  throw new Error("Set BSC_TESTNET_RPC_URL and REM_CONTRACT_ADDRESS for receipt-only reconciliation.");
}

const startedAt = new Date();
await mongoose.connect(uri);
try {
  let checked = 0;
  let corrected = 0;
  let errors = 0;
  for (;;) {
    // Force every hash through receipt reconciliation. Event ingestion is excluded:
    // it could create records beyond the restored archive and is not needed here.
    const result = await reconcileTransactions({ force: true, forceBefore: startedAt, skipEventSync: true });
    if (result.skipped) throw new Error("Restore reconciliation is already running.");
    checked += result.checked;
    corrected += result.corrected;
    errors += result.errors;
    if (result.checked === 0) break;
    if (result.errors) throw new Error(`Restore reconciliation encountered ${result.errors} receipt error(s).`);
  }
  const incomplete = await mongoose.connection.db.collection("transactions").countDocuments({
    txHash: { $type: "string", $ne: "" },
    $or: [{ lastReconciledAt: { $exists: false } }, { lastReconciledAt: { $lt: startedAt } }],
  });
  if (errors || incomplete) {
    throw new Error(`Restore reconciliation did not complete (${errors} errors, ${incomplete} unchecked transaction hashes).`);
  }
  console.info(`Restore reconciliation complete: checked ${checked} txHash record(s), corrected ${corrected}. Receipt lookups only; no transactions were submitted.`);
} finally {
  await mongoose.disconnect();
}
