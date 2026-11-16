// npm can return JSON errors (for example EAI_AGAIN or an unavailable registry).
// Those responses are not evidence of a clean dependency tree.
export function validateAuditReport(audit) {
  if (
    !audit || audit.error || audit.auditReportVersion !== 2 ||
    !audit.vulnerabilities || typeof audit.vulnerabilities !== "object" ||
    Array.isArray(audit.vulnerabilities) ||
    !Number.isInteger(audit.metadata?.vulnerabilities?.total) ||
    audit.metadata.vulnerabilities.total !== Object.keys(audit.vulnerabilities).length ||
    Object.values(audit.vulnerabilities).some((entry) =>
      !entry || !["info", "low", "moderate", "high", "critical"].includes(entry.severity) || !Array.isArray(entry.via))
  ) {
    throw new Error(`npm did not return a complete audit report: ${audit?.error?.summary || "invalid report"}`);
  }
  return audit;
}

export function unapprovedFindings(audit, approvedFindings = new Set()) {
  validateAuditReport(audit);
  const vulnerabilities = audit.vulnerabilities;
  function findingsFor(name, visited = new Set()) {
    if (visited.has(name)) return [];
    const vulnerability = vulnerabilities[name];
    if (!vulnerability || !Array.isArray(vulnerability.via)) return ["unidentified advisory"];
    const seen = new Set([...visited, name]);
    return vulnerability.via.flatMap((entry) => {
      if (typeof entry === "string") return findingsFor(entry, seen);
      if (["info", "low", "moderate"].includes(entry?.severity)) return [];
      const findings = [...(entry?.url ?? "").matchAll(/GHSA-[A-Za-z0-9-]+/g)].map((match) => match[0]);
      return findings.length ? findings : ["unidentified advisory"];
    });
  }
  return Object.entries(vulnerabilities).flatMap(([name, vulnerability]) => {
    if (!["high", "critical"].includes(vulnerability.severity)) return [];
    const findings = [...new Set(findingsFor(name))];
    return findings.length && findings.every((finding) => approvedFindings.has(finding))
      ? []
      : [`${name} (${vulnerability.severity}; ${findings.join(", ") || "no GHSA identifier"})`];
  });
}
