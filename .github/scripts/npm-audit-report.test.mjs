import assert from "node:assert/strict";
import test from "node:test";
import { unapprovedFindings, validateAuditReport } from "./npm-audit-report.mjs";

const report = (vulnerabilities = {}) => ({
  auditReportVersion: 2,
  vulnerabilities,
  metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } },
});

test("accepts a complete clean audit report", () => {
  const clean = report();
  assert.equal(validateAuditReport(clean), clean);
});

test("preserves vulnerabilities for severity and exception evaluation", () => {
  const vulnerable = report({ example: { severity: "critical", via: [] } });
  assert.equal(validateAuditReport(vulnerable).vulnerabilities.example.severity, "critical");
});

test("registry and authentication errors cannot pass as clean audits", () => {
  for (const code of ["EAI_AGAIN", "ENOAUDIT", "E401", "E500"]) {
    assert.throws(() => validateAuditReport({ error: { code, summary: "Audit unavailable" } }), /Audit unavailable/);
  }
  assert.throws(() => validateAuditReport({ ...report(), error: { code: "E500" } }));
});

test("missing, truncated, or unsupported audit reports fail closed", () => {
  for (const invalid of [null, {}, { vulnerabilities: {} }, { ...report(), auditReportVersion: 1 },
    { ...report(), vulnerabilities: [] }, { ...report(), metadata: {} },
    { ...report(), metadata: { vulnerabilities: { total: 1 } } },
    report({ broken: { severity: "unknown", via: [] } })]) {
    assert.throws(() => validateAuditReport(invalid), /complete audit report/);
  }
});

test("an exception covers inherited findings without covering unrelated advisories", () => {
  const advisory = "GHSA-aaaa-bbbb-cccc";
  const audit = report({
    parent: { severity: "high", via: ["child", "moderate"] },
    moderate: { severity: "moderate", via: [{ severity: "moderate", url: "https://github.com/advisories/GHSA-1111-2222-3333" }] },
    child: { severity: "high", via: [{ url: `https://github.com/advisories/${advisory}` }] },
    other: { severity: "critical", via: [{ url: "https://github.com/advisories/GHSA-dddd-eeee-ffff" }] },
  });
  assert.equal(unapprovedFindings(audit).length, 3);
  assert.deepEqual(unapprovedFindings(audit, new Set([advisory])), ["other (critical; GHSA-dddd-eeee-ffff)"]);
});

test("missing advisory links and circular dependency chains remain blocked", () => {
  for (const vulnerabilities of [
    { a: { severity: "high", via: ["missing"] } },
    { a: { severity: "high", via: ["b"] }, b: { severity: "high", via: ["a"] } },
    { a: { severity: "high", via: [{ url: "https://example.com/unknown" }] } },
  ]) {
    assert.ok(unapprovedFindings(report(vulnerabilities)).length > 0);
  }
});
