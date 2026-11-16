# Proposed Hardhat tooling exception — approval pending

This is a review draft, not an active exception. It is deliberately outside
`.github/security-exceptions/`; the dependency gate continues to block this finding.

Finding: GHSA-mrhx-c7xc-m3w5
Projects: contracts
Severity: high
Approved by: PENDING — release-security environment reviewer
Approval date: PENDING
Expires: 2026-12-17
Tracking issue: PENDING — create a remediation issue before activation
Mitigation: Keep Hardhat in isolated development/CI jobs; do not expose its JSON-RPC server to untrusted networks or accept untrusted Hardhat configuration or validation inputs. Install the toolchain only from the committed lockfile. Reassess upstream weekly and remove the exception as soon as a compatible patched dependency is available.

## Evidence and scope

- [Upstream advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
  describes memory exhaustion when validating oversized collections. It lists
  versions below 4.6.6 as affected.
- As checked on 2026-11-17, Hardhat 3.22.0 requires `zod: ^3.23.8`;
  `@nomicfoundation/hardhat-zod-utils` also requires the Zod 3 peer API.
  The lockfile resolves Zod 3.25.76. Forcing Zod 4 violates these contracts.
- Zod is confined to the contracts development toolchain. The backend and
  frontend dependency trees audit clean, including development dependencies.
- npm reports this same underlying advisory through 12 parent toolchain packages;
  these are inherited findings, not 12 additional independent vulnerabilities.
- Other high-severity tooling findings were fixed by updating compatible
  dependencies, upgrading the Mocha toolbox and Mocha together, and updating
  Undici to 6.29.1. Contract regression tests pass with the new toolchain.
- Three moderate findings remain in Mocha's `glob`/`minimatch` dependency chain.
  They are visible to npm audit and are outside this proposed high-severity exception.

## Review and activation

The reviewer must confirm the isolation controls, record their GitHub handle and
actual approval date, and supply a real tracking issue URL. Only then move this
file into `.github/security-exceptions/`. Do not mark this draft approved merely
to make CI green. The gate validates exception expiration on every invocation.

After activation, run:

```sh
node .github/scripts/check-security-exceptions.mjs
node .github/scripts/check-npm-audit-gate.mjs --include-dev backend frontend contracts
```

If upstream has not shipped a compatible fix before expiry, a reviewer must
reassess the risk; there is no automatic renewal.
