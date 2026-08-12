import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const policyFile = ".github/scripts/check-terminology.mjs";
const forbiddenTerms = /\beth(?:ereum)?\b|etherscan/gi;

// Compatibility-sensitive API, configuration, and EIP-1193 identifiers only.
// These exact tokens are allowed globally; their component words are never allowed.
const compatibilityIdentifiers = /\b(?:amountEth|getEthBalance|convertEthToUsd|eth_accounts|eth_requestAccounts|eth_chainId|REM_RATE_USD_PER_ETH|MIN_TRANSFER_ETH|MAX_TRANSFER_ETH)\b|\bwindow\.ethereum\b/gi;
const terminologyOccurrences = new RegExp(
  `${compatibilityIdentifiers.source}|${forbiddenTerms.source}`,
  "gi",
);

function isAllowedCompatibilityIdentifier(value) {
  compatibilityIdentifiers.lastIndex = 0;
  return compatibilityIdentifiers.test(value) && compatibilityIdentifiers.lastIndex === value.length;
}

function findViolations(file, content) {
  const violations = [];
  for (const line of content.split(/\r?\n/)) {
    for (const match of line.matchAll(terminologyOccurrences)) {
      if (!isAllowedCompatibilityIdentifier(match[0])) {
        violations.push(`obsolete terminology "${match[0]}"`);
      }
    }
  }
  return violations;
}

function runSelfTest() {
  assert.deepEqual(findViolations("any-file", "amountEth getEthBalance eth_requestAccounts window.ethereum"), []);
  assert.equal(findViolations("frontend/src/components/ConnectWalletButton.jsx", 'const label = "Ethereum";').length, 1);
  assert.equal(findViolations("frontend/src/components/ConnectWalletButton.jsx", 'const label = "ETH";').length, 1);
  assert.equal(findViolations("frontend/src/components/ConnectWalletButton.jsx", 'const url = "https://etherscan.io";').length, 1);
}

runSelfTest();

const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const failures = [];

for (const file of files) {
  if (file === policyFile || file.endsWith("package-lock.json") || file.endsWith(".pdf")) continue;
  const lines = readFileSync(resolve(root, file), "utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const violation of findViolations(file, line)) failures.push(`${file}:${index + 1}: ${violation}`);
  }
}

if (failures.length) {
  console.error(`Terminology policy failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Terminology policy passed.");
