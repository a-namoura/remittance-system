# Dependency maintenance

Every pull request and main-branch push runs locked installs and the backend,
frontend and contract tests. The frontend also builds for production. The
dependency workflow checks the complete supply chain, including development tools,
and runs daily to detect advisories published after the last source change.
The gate fails on registry errors rather than treating missing results as clean.

Use Node 22, matching `.nvmrc`, package engines, and the Docker images. Node major
updates require a coordinated change; Dependabot continues minor and patch image
updates. Backend development uses Node's built-in `--watch` support.

For each of `backend`, `frontend`, and `contracts`, run from its directory:

```sh
npm ci --ignore-scripts
npm audit --include=dev
npm test
```

Also run `npm run build` and `npm run test:requirements` from `frontend`.
Use compatible dependency updates first. When a fix needs a major version,
upgrade dependent plugins together and rerun the tests. Never run
`npm audit fix --force` without reviewing its proposed version changes.

High and critical findings block CI unless covered by a reviewed, unexpired
exception in `.github/security-exceptions/`. Review drafts live in
`docs/security-exception-drafts/` and have no effect on the gate. Moderate and low
findings remain visible in npm's report and should be reviewed during maintenance.

Configure branch protection or a ruleset to require Repository policy, Tests
(backend), Tests (frontend), Tests (contracts), all three npm audit jobs, and the
existing performance and terminology checks. Workflow files alone do not prevent
an administrator from merging around failed checks.

At review time (2026-11-17), the repository's only visible ruleset,
`my-ruleset`, was disabled. Confirm branch protection and enable the required
checks through the repository administration settings before treating CI as a
merge barrier. The connected GitHub integration could not read branch protection.

Dependency security updates are grouped separately by Dependabot for review.
Review and merge those updates promptly; a scanner detects new vulnerabilities
but cannot guarantee that future advisories or regressions will never occur.
