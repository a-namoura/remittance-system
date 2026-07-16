import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const projects = process.argv.slice(2);
if (!projects.length) throw new Error("Pass at least one project directory.");

const exceptionsDirectory = resolve(root, ".github/security-exceptions");
const approvedFindings = new Set(
  existsSync(exceptionsDirectory)
    ? readdirSync(exceptionsDirectory)
        .filter((file) => file.endsWith(".md"))
        .flatMap((file) => [...readFileSync(resolve(exceptionsDirectory, file), "utf8").matchAll(/^Finding:\s*(GHSA-[A-Za-z0-9-]+)/gm)].map((match) => match[1]))
    : [],
);
const failures = [];

for (const project of projects) {
  let output;
  try {
    output = execFileSync(npmCommand, ["audit", "--json", "--omit=dev"], {
      cwd: resolve(root, project),
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    output = error.stdout?.toString() ?? "";
    if (!output) throw error;
  }
  const audit = JSON.parse(output);
  for (const [name, vulnerability] of Object.entries(audit.vulnerabilities ?? {})) {
    if (!["high", "critical"].includes(vulnerability.severity)) continue;
    const findings = (vulnerability.via ?? [])
      .filter((entry) => typeof entry === "object")
      .flatMap((entry) => [...(entry.url ?? "").matchAll(/GHSA-[A-Za-z0-9-]+/g)].map((match) => match[0]));
    if (!findings.length || !findings.every((finding) => approvedFindings.has(finding))) {
      failures.push(`${project}: ${name} (${vulnerability.severity}; ${findings.join(", ") || "no GHSA identifier"})`);
    }
  }
}

if (failures.length) {
  console.error(`Unapproved high-risk production dependency findings:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("No unapproved high-risk production dependency findings.");
