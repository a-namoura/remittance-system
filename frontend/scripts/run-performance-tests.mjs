import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const backendRoot = path.resolve(root, "../backend");
const resultsPath = path.join(root, "test-results", "performance-results.json");
const reportDir = path.join(root, "requirement-evidence");
const generatedAt = new Date().toISOString();

const requirements = [
  { id: "UI-2.10", section: "User Interaction 2.10", threshold: "Notification displayed within 2000 ms of backend response", tests: [
    "login success notification appears within 2 seconds", "login failure notification includes the backend reason within 2 seconds",
    "registration success notification appears within 2 seconds", "registration failure notification includes the backend reason within 2 seconds",
    "password reset success notification appears within 2 seconds", "password reset failure notification includes the backend reason within 2 seconds",
    "wallet connection success notification appears within 2 seconds", "wallet connection failure notification includes the backend reason within 2 seconds",
  ] },
  { id: "DP-4.2", section: "Data Processing 4.2", threshold: "Blockchain result persisted to DB within 2000 ms", tests: [
    "final successful blockchain result is persisted to the MongoDB transaction within 2 seconds",
    "final failed blockchain result is persisted to the MongoDB transaction within 2 seconds",
  ] },
  { id: "REL-5.1", section: "Reliability 5.1", threshold: "Blockchain and MongoDB transaction records remain consistent", tests: [
    "successful blockchain result synchronizes MongoDB status, hash, block, and timestamps",
    "failed blockchain result synchronizes MongoDB without losing transfer fields",
  ] },
  { id: "REL-5.2", section: "Reliability 5.2", threshold: "Records are preserved during temporary application, network, or database failures", tests: [
    "a temporary database write failure after broadcast retains a complete reconciliation snapshot",
    "temporary RPC receipt failures preserve pending and terminal records for retry",
    "temporary confirmation RPC failure stays pending and does not submit a duplicate transaction",
  ] },
  { id: "REL-5.3", section: "Reliability 5.3", threshold: "Reconciliation verifies sender, receiver, amount, transaction hash, and status", tests: [
    "reconciliation compares every transfer identity field before accepting an event",
    "restart reconciliation writes final chain success and failure without changing transfer identity",
  ] },
  { id: "REL-5.4", section: "Reliability 5.4", threshold: "Recovery restores the final blockchain status", tests: [
    "restart reconciliation writes final chain success and failure without changing transfer identity",
  ] },
  { id: "PERF-2.1", section: "Performance 2.1", threshold: "User and API requests <= 2000 ms, excluding blockchain confirmation", tests: [
    "API middleware starts and completes within the 2 second SLA",
    "representative API routes carry the 2 second response SLA",
    "real representative Express endpoints respond within 2 seconds with mocked services",
  ] },
  { id: "PERF-2.2", section: "Performance 2.2", threshold: "Average page load <= 2000 ms", tests: ["key pages load within 2 seconds on average"] },
  { id: "PERF-2.3", section: "Performance 2.3", threshold: "Transaction validation and submission <= 2000 ms after confirmation, excluding blockchain confirmation", tests: ["validated transaction submits within 2 seconds after confirmation excluding blockchain confirmation"] },
  { id: "PERF-2.4", section: "Performance 2.4", threshold: "Blockchain hash or failure reason displayed <= 2000 ms after blockchain response", tests: [
    "terminal blockchain hash reaches the UI within 2 seconds of the backend result",
    "terminal transaction failure reason is shown in the UI within 2 seconds",
  ] },
];

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = execFile(command, args, { cwd: options.cwd ?? root, env: options.env ?? process.env, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ exitCode: typeof error?.code === "number" ? error.code : (error ? 1 : 0), stdout, stderr });
    });
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
}

function nodeTestsFromTap(output) {
  return [...output.matchAll(/^(ok|not ok) \d+ - (.*?)\r?\n  ---\r?\n  duration_ms: ([\d.]+)/gm)]
    .map(([, result, name, durationMs]) => ({ name, status: result === "ok" ? "pass" : "fail", durationMs: Number(durationMs) }));
}

function playwrightTests(report) {
  const tests = [];
  function walk(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const result = test.results?.[0];
          tests.push({ name: spec.title, status: test.status === "expected" ? "pass" : "fail", durationMs: result?.duration ?? null });
        }
      }
      walk(suite.suites);
    }
  }
  walk(report.suites);
  return tests;
}

const backend = await run(process.execPath, ["--test", "--test-reporter=tap", "test/performance.test.js", "test/transactionConsistency.test.js", "test/transactionFaultRecovery.test.js"], { cwd: backendRoot });
const frontend = await run(process.execPath, ["./node_modules/@playwright/test/cli.js", "test", "--workers=1", "e2e/performance.spec.js", "e2e/notification-sla.spec.js"], { env: { ...process.env, PERFORMANCE_REPORT: "1" } });

let browserTests = [];
try { browserTests = playwrightTests(JSON.parse(await readFile(resultsPath, "utf8"))); } catch { /* failed runner is represented by absent required tests */ }
const tests = [...nodeTestsFromTap(backend.stdout), ...browserTests];
const git = await run("git", ["rev-parse", "HEAD"], { cwd: path.resolve(root, "..") });
const commitSha = git.stdout.trim() || "unknown";
const byName = new Map(tests.map((test) => [test.name, test]));
const evidence = requirements.map((requirement) => {
  const requiredTests = requirement.tests.map((name) => byName.get(name) ?? { name, status: "absent", durationMs: null });
  return { ...requirement, status: requiredTests.length > 0 && requiredTests.every((test) => test.status === "pass") ? "pass" : "fail", tests: requiredTests };
});
const report = { generatedAt, commitSha, status: evidence.every((requirement) => requirement.status === "pass") ? "pass" : "fail", requirements: evidence };

await mkdir(reportDir, { recursive: true });
await writeFile(path.join(reportDir, "requirement-evidence.json"), `${JSON.stringify(report, null, 2)}\n`);
const rows = evidence.flatMap((requirement) => requirement.tests.map((test) => `| ${requirement.id} | ${test.name} | ${test.status.toUpperCase()} | ${test.durationMs ?? "N/A"} | ${requirement.threshold} |`));
await writeFile(path.join(reportDir, "requirement-evidence.md"), `# SRS requirement evidence\n\n- Generated (UTC): ${generatedAt}\n- Git commit: ${commitSha}\n- Overall status: **${report.status.toUpperCase()}**\n\nA requirement passes only when every listed required test is present and passes.\n\n| Requirement | Test | Result | Measured duration (ms) | Threshold |\n| --- | --- | --- | ---: | --- |\n${rows.join("\n")}\n`);
process.exitCode = backend.exitCode || frontend.exitCode || (report.status === "pass" ? 0 : 1);
