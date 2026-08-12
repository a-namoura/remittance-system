# Threat model

## Scope and assumptions

This model covers the React client, Express/MongoDB API, email and RPC providers,
the BNB Smart Chain Testnet remittance contract, and CI/release artifacts. It does not claim
that the testnet deployment is suitable for custody or production money movement.
The API's configured signing key is a high-value asset: compromise can submit
transfers from the service-controlled wallet.

## Assets, trust boundaries, and threats

| Asset / boundary | Threats | Existing controls | Residual risk / required practice |
| --- | --- | --- | --- |
| User credentials, JWTs, recovery and verification secrets | Credential stuffing, token theft, brute force, reset abuse | bcrypt password hashes, signed/expiring JWTs, session-version invalidation, failed-login lockout, field allowlists, redacted logs | Put secrets in a manager, enforce a strong `JWT_SECRET`, and add endpoint/IP rate limits for code and reset flows. |
| Browser ↔ API | Cross-origin requests, downgrade, request tampering | Explicit CORS origin with credentials, production HTTPS validation, HTTPS redirect and HSTS | Terminate TLS at a trusted proxy; keep `FRONTEND_URL`, `API_URL`, and proxy headers correct. |
| User and payment data in MongoDB | Unauthorized reads/writes, injection, backup exposure, operational loss | Auth middleware, resource ownership checks, Mongoose schemas, encrypted backup/restore tooling, production TLS/authentication checks | Use least-privilege database accounts and isolated, encrypted backup storage; review access quarterly. |
| Wallet association and transfer intent | Wallet takeover, recipient substitution, replay/duplicate submission, unauthorized spending | Wallet verification, normalized addresses, self-transfer/amount/balance checks, single-use payment codes, transfer request key, pending-state reconciliation, audit events | Treat the payment-code implementation and signer-key storage as release blockers; see the vulnerability register. |
| Transfer links | Token guessing, reuse, race conditions, recipient privacy exposure | 256-bit random token stored as SHA-256 hash, 24-hour expiry, atomic active→claiming transition, claim state and integrity checks | Links are bearer capabilities: do not place them in analytics, logs, or referrers; the resolver intentionally exposes limited link details to holders. |
| Blockchain signer, RPC, and contract | Private-key exfiltration, malicious/unavailable RPC, chain reorgs, contract faults | Environment configuration, receipt/event reconciliation, confirmation and reorg-lookback settings, simple contract checks for zero/self receiver and amount | Use a managed key/HSM and trusted RPC, monitor reconciliation failures, and require independent contract review before mainnet use. |
| Source, dependencies, and releases | Dependency compromise, insecure change, artifact tampering | Lockfiles, dependency inventory/review, npm audit, CodeQL, CODEOWNERS/security approval, SBOM and checksums, release exception gate | Protect `main`, configure required environments/reviewers, and remediate high/critical findings before release. |

## Abuse cases and detection

- An attacker retries login or verification codes: inspect `AUTH_TOKEN_FAILED`, login lockout activity, and payment-code audit records; alert on bursts by account/IP once rate limiting is added.
- A bearer transfer link is claimed concurrently: inspect `claiming` links and transaction reconciliation/audit records; state transitions prevent more than one active claim.
- A transaction is submitted but finality is unclear: reconciliation records receipt/event status and moves unresolved work to `reconciliation_required` rather than treating submission as success.
- A release includes an unsafe dependency: dependency review, production `npm audit`, CodeQL, the inventory check, and the release gate provide pre-release evidence.

Review this model at least quarterly and before changes to authentication, wallet ownership, transaction routing, the contract, key management, or deployment topology. Record newly confirmed findings in [the vulnerability register](vulnerability-register.md).
