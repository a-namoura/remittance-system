import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unapprovedFindings, validateAuditReport } from "./npm-audit-report.mjs";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const includeDev = process.argv.includes("--include-dev");
const projects = process.argv.slice(2).filter((argument) => argument !== "--include-dev");
if (!projects.length) throw new Error("Pass at least one project directory.");

// Standalone invocation must enforce expiration, just like the release workflow.
execFileSync(process.execPath, [resolve(root, ".github/scripts/check-security-exceptions.mjs")], { stdio: "inherit" });

const exceptionsDirectory = resolve(root, ".github/security-exceptions");
const approvedExceptions = (
  existsSync(exceptionsDirectory)
    ? readdirSync(exceptionsDirectory)
        .filter((file) => file.endsWith(".md"))
        .filter((file) => file !== "README.md")
        .map((file) => {
          const content = readFileSync(resolve(exceptionsDirectory, file), "utf8");
          return {
            finding: content.match(/^Finding:\s*(GHSA-[A-Za-z0-9-]+)/m)?.[1],
            projects: (content.match(/^Projects:\s*(.+)$/m)?.[1] ?? "").split(",").map((name) => name.trim()),
          };
        })
    : []
);
const failures = [];

for (const project of projects) {
  let output;
  try {
    output = execFileSync(npmCommand, ["audit", "--json", includeDev ? "--include=dev" : "--omit=dev"], {
      cwd: resolve(root, project),
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    output = error.stdout?.toString() ?? "";
    if (!output) throw error;
  }
  const audit = validateAuditReport(JSON.parse(output));
  const approvedFindings = new Set(approvedExceptions.filter((exception) => exception.projects.includes(project)).map((exception) => exception.finding));
  failures.push(...unapprovedFindings(audit, approvedFindings).map((finding) => `${project}: ${finding}`));
}

if (failures.length) {
  console.error(`Unapproved high-risk ${includeDev ? "supply-chain" : "production"} dependency findings:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`No unapproved high-risk ${includeDev ? "supply-chain" : "production"} dependency findings.`);
