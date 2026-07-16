# Security test matrix and coverage

This is a traceability matrix, not a claim of exhaustive coverage. `Automated`
means a repository test or CI control currently exercises the requirement;
`Manual` requires release/reviewer evidence. Run backend tests with
`npm test --prefix backend`; run contract tests with `npx hardhat test` from
`contracts/`.

| Area / threat | Control or expected result | Current coverage | Gap / next test |
| --- | --- | --- | --- |
| Secret logging | Credentials, URI passwords, tokens and codes are redacted | Automated: `backend/test/security.test.js`; logging utility | Add route-level tests asserting error and audit output never exposes a supplied secret. |
| Production transport | External origins/RPC use HTTPS; API redirects HTTP and emits HSTS | Automated: `backend/test/security.test.js` covers URL validation; manual deployment/proxy check | Add integration tests for redirect, HSTS and CORS headers. |
| Authentication/session revocation | Missing/invalid/disabled/session-version-mismatched token is rejected | Code inspection: `authMiddleware`; no direct automated route test | Add API tests for each rejection and logout/password-reset invalidation. |
| Login resistance | Password failures lock the account after configured threshold | Code inspection: `authController`; no dedicated automated test | Add boundary tests for threshold, lockout expiry, and enumeration-safe responses. |
| Input allowlisting | Unexpected body/query fields receive 400 | Code inspection: route `allowBodyFields`/`allowQueryFields`; no tests | Add table-driven tests for every public route. |
| Authorization / IDOR | Non-participants cannot read transactions; admin access is role-gated | Code inspection: transaction and admin routes; no route test | Add two-user and admin/non-admin integration tests for all object endpoints. |
| Wallet and transfer validation | Verified ownership, valid addresses, no self/zero/out-of-range amount, sufficient balance | Unit tests cover transfer-request behavior; code inspection for route validation | Mock RPC and add negative endpoint tests. |
| Duplicate and asynchronous transfers | In-flight duplicate requests are rejected; state is reconciled rather than assumed final | Automated: `backend/test/transactionRequests.test.js`; reconciliation code review | Add concurrency integration test and reorg/receipt-failure scenarios. |
| Payment and login verification | Code is short-lived and single-use | Code inspection only | Add expiry, single-use, brute-force, hashing, and delivery-provider contract tests. |
| Transfer links | Opaque token is hashed, expires, and has atomic one-time claim | Code inspection; restore integrity checks cover references | Add parallel claim, expiry, and unauthorized claim tests. |
| Smart contract | Reject zero receiver, self-transfer, and zero value; transfer emits event | Automated: `contracts/test/Remittance.ts` | Add failure-on-receiver, fuzz/property tests, gas bounds, and independent audit before mainnet. |
| Dependency / static analysis | No high-severity production dependency finding; code is scanned | Automated CI: dependency review, production npm audit, CodeQL, dependency inventory | Enforce checks in the repository ruleset and review findings/SBOM per release. |
| Backup and restore | Archive authentication, receipt reconciliation, and reference integrity hold | Automated: `backend/test/encryptedRestore.test.js`; documented operator procedure | Exercise a scheduled restore drill with production-like, non-production data. |
| Release governance | Sensitive changes receive protected-environment approval; release artifacts are traceable | Automated CI workflow plus manual environment/ruleset configuration | Periodically verify settings and capture evidence in the release record. |
| Security regression gate | Backend security/reconciliation and smart-contract tests must pass for a security-sensitive change and every release | Automated: `Security regression tests` CI job and `Release security gate` | Protect `main` by requiring the CI check; add regression tests for every closed register item. |

## Exit criteria

Before a production release, resolve or formally accept every open high/critical
register item, run the automated suite and required CI checks, perform the
manual deployment checks above, and attach evidence to the release/security
case. Update this matrix whenever a control, route, dependency pipeline, or
threat-model assumption changes.
