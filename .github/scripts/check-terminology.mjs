import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const forbiddenTerms = /\beth(?:ereum)?\b|etherscan/gi;

// These are compatibility-sensitive EIP-1193 provider and existing API/configuration identifiers.
// Every exception must name the file and exact matched token it permits.
const allowlist = new Map([
  [".github/scripts/check-terminology.mjs", new Set(["eth", "ethereum", "etherscan"])],
  ["backend/src/blockchain/remittanceClient.js", new Set(["eth"])],
  ["backend/src/controllers/transactionController.js", new Set(["eth"])],
  ["backend/src/routes/chatRoutes.js", new Set(["eth"])],
  ["backend/src/routes/transactionRoutes.js", new Set(["eth"])],
  ["backend/src/utils/fiat.js", new Set(["eth"])],
  ["backend/src/utils/transferLimits.js", new Set(["eth"])],
  ["backend/src/utils/walletBalances.js", new Set(["eth"])],
  ["backend/test/performance.test.js", new Set(["eth"])],
  ["backend/test/transferLimits.test.js", new Set(["eth"])],
  ["backend/test/transactionRoutes.test.js", new Set(["eth"])],
  ["frontend/e2e/notification-sla.spec.js", new Set(["ethereum"])],
  ["frontend/src/components/ConnectWalletButton.jsx", new Set(["ethereum"])],
  ["frontend/src/pages/Chat.jsx", new Set(["eth"])],
  ["frontend/src/pages/RequestMoney.jsx", new Set(["eth"])],
  ["frontend/src/pages/SendMoney.jsx", new Set(["eth"])],
  ["frontend/src/services/chatApi.js", new Set(["eth"])],
  ["frontend/src/services/transactionApi.js", new Set(["eth"])],
]);

const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const failures = [];

for (const file of files) {
  if (file.endsWith("package-lock.json") || file.endsWith(".pdf")) continue;
  const content = readFileSync(resolve(root, file), "utf8");
  for (const match of content.matchAll(forbiddenTerms)) {
    const term = match[0].toLowerCase();
    if (allowlist.get(file)?.has(term)) continue;
    const line = content.slice(0, match.index).split(/\r?\n/).length;
    failures.push(`${file}:${line}: obsolete terminology "${match[0]}"`);
  }
}

if (failures.length) {
  console.error(`Terminology policy failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Terminology policy passed.");
