# Approved security exceptions

An exception is allowed only when a high or critical dependency finding cannot be remediated before release. Each exception must be an individual Markdown file in this directory and must use this exact metadata format:

```text
Finding: GHSA-... or scan identifier
Severity: high
Approved by: GitHub handle of a release-security environment reviewer
Approval date: YYYY-MM-DD
Expires: YYYY-MM-DD
Tracking issue: https://github.com/OWNER/REPOSITORY/issues/123
Mitigation: Compensating control and remediation plan
```

The release approver must verify the evidence and expiration before approving the protected `release-security` environment. Exceptions expire on the stated date, must be removed when fixed, and must never cover a critical finding without a documented compensating control and release-owner approval.
