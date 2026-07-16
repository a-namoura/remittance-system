import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const exceptionsDirectory = resolve(process.cwd(), ".github/security-exceptions");
if (!existsSync(exceptionsDirectory)) {
  console.log("No active security exceptions.");
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const errors = [];
for (const file of readdirSync(exceptionsDirectory).filter((entry) => entry.endsWith(".md") && entry !== "README.md")) {
  const content = readFileSync(resolve(exceptionsDirectory, file), "utf8");
  const fields = Object.fromEntries(
    [...content.matchAll(/^([A-Za-z][A-Za-z ]+):\s*(.+)$/gm)].map(([, key, value]) => [key, value.trim()]),
  );
  for (const field of ["Finding", "Severity", "Approved by", "Approval date", "Expires", "Tracking issue", "Mitigation"]) {
    if (!fields[field]) errors.push(`${file}: missing ${field}.`);
  }
  if (fields.Severity && !["high", "critical"].includes(fields.Severity.toLowerCase())) {
    errors.push(`${file}: Severity must be high or critical.`);
  }
  if (fields.Expires && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.Expires) || fields.Expires < today)) {
    errors.push(`${file}: Expires must be a current or future YYYY-MM-DD date.`);
  }
  if (fields["Tracking issue"] && !/^https:\/\/github\.com\/.+\/issues\/\d+$/.test(fields["Tracking issue"])) {
    errors.push(`${file}: Tracking issue must be a GitHub issue URL.`);
  }
}

if (errors.length) {
  console.error(`Security exception policy failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("Active security exceptions are valid and unexpired.");
