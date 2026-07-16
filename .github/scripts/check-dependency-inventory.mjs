import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const generated = spawnSync(process.execPath, [".github/scripts/generate-dependency-inventory.mjs"], {
  cwd: root,
  encoding: "utf8",
});

if (generated.status !== 0) {
  process.stderr.write(generated.stderr);
  process.exit(generated.status ?? 1);
}

const committed = JSON.parse(readFileSync(resolve(root, ".github/dependency-inventory.json"), "utf8"));
if (JSON.stringify(committed) !== JSON.stringify(JSON.parse(generated.stdout))) {
  console.error("Dependency inventory is stale. Run: node .github/scripts/generate-dependency-inventory.mjs > .github/dependency-inventory.json");
  process.exit(1);
}

console.log("Dependency inventory matches manifests and lockfiles.");
