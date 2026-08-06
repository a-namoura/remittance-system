import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const resultsPath = path.join(root, "test-results", "performance-results.json");
const reportDir = path.join(root, "performance-reports");
const jsonReportPath = path.join(reportDir, "performance-report.json");
const markdownReportPath = path.join(reportDir, "performance-report.md");

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function collectSpecs(suites, output = []) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const result of spec.tests || []) {
        output.push({ title: [...(suite.titlePath || []), spec.title].filter(Boolean).join(" > "), status: result.status, durationMs: result.results?.[0]?.duration ?? 0 });
      }
    }
    collectSpecs(suite.suites, output);
  }
  return output;
}

const backendStartedAt = Date.now();
const backendExitCode = await run("npm", ["test", "--prefix", "../backend", "--", "test/performance.test.js"], process.env);
const backendTest = {
  title: "API and transaction submission SLA checks",
  status: backendExitCode === 0 ? "expected" : "failed",
  durationMs: Date.now() - backendStartedAt,
};
const exitCode = await run(
  "npx",
  ["playwright", "test", "--workers=1", "e2e/performance.spec.js", "e2e/notification-sla.spec.js"],
  { ...process.env, PERFORMANCE_REPORT: "1" }
);
await mkdir(reportDir, { recursive: true });
let tests = [];
try {
  tests = collectSpecs(JSON.parse(await readFile(resultsPath, "utf8")).suites);
} catch {
  tests = [{ title: "Performance test runner", status: "failed", durationMs: 0 }];
}
tests.unshift(backendTest);
const report = { generatedAt: new Date().toISOString(), thresholdsMs: { api: 2000, transactionSubmissionExcludingConfirmation: 2000, averagePageLoad: 2000, transactionResultUiAfterBackendResult: 2000, notificationUiAfterBackendResponse: 2000 }, passed: backendExitCode === 0 && exitCode === 0 && tests.every((test) => test.status === "expected"), tests };
await writeFile(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(markdownReportPath, `# Performance test report\n\nStatus: **${report.passed ? "PASS" : "FAIL"}**\n\n| Check | Status | Duration |\n| --- | --- | ---: |\n${tests.map((test) => `| ${test.title} | ${test.status} | ${test.durationMs} ms |`).join("\n")}\n`);
process.exitCode = backendExitCode || exitCode || (report.passed ? 0 : 1);
