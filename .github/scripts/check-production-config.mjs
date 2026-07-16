import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const packages = ["backend", "frontend", "contracts"];
const supportedNode = ">=22 <23";
const failures = [];

function fail(message) {
  failures.push(message);
}

for (const directory of packages) {
  const packagePath = resolve(root, directory, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (packageJson.engines?.node !== supportedNode) {
    fail(`${directory}/package.json must declare engines.node as ${supportedNode}.`);
  }
}

const secretName = /(?:^|_)(?:SECRET|PRIVATE(?:_KEY)?|PASSWORD|TOKEN|API_KEY|ACCESS_KEY)(?:_|$)/i;
const exampleFiles = [".env.example", "backend/.env.example", "frontend/.env.example", "contracts/.env.example"];

for (const file of exampleFiles) {
  const path = resolve(root, file);
  if (!existsSync(path)) continue;
  for (const [index, line] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && secretName.test(match[1]) && match[2].trim()) {
      fail(`${file}:${index + 1} assigns a value to secret-like variable ${match[1]}; leave it empty and supply it through the deployment secret manager.`);
    }
  }
}

const frontendDirectory = resolve(root, "frontend");
const frontendEnvFiles = [".env", ".env.local", ".env.production", ".env.production.local", ".env.example"];
for (const file of frontendEnvFiles) {
  const path = resolve(frontendDirectory, file);
  if (!existsSync(path)) continue;
  for (const [index, line] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    const match = line.match(/^\s*(VITE_[A-Za-z0-9_]+)\s*=/);
    if (match && secretName.test(match[1])) {
      fail(`frontend/${file}:${index + 1} exposes secret-like variable ${match[1]}. VITE_ values are bundled into client code.`);
    }
  }
}

if (failures.length) {
  console.error("Production configuration policy failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Production configuration policy passed.");
