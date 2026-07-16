# Security artifacts and release records

`.github/dependency-inventory.json` is the committed inventory of direct dependencies for the backend, frontend, and contracts projects. It records each source manifest, lockfile digest, declared version, and production/development scope. The `Dependency inventory` CI check makes a manifest or lockfile change fail until the inventory is regenerated with `node .github/scripts/generate-dependency-inventory.mjs > .github/dependency-inventory.json`.

Every published GitHub release triggers `Release security artifacts`. It creates a CycloneDX JSON SBOM for the complete dependency graph, a SHA-256 checksum manifest, and a release-security record containing the release tag, source revision, workflow-run URL, and SBOM format. The workflow attaches all three files to the GitHub release and retains the workflow copy for 90 days.

Use **Generate release notes** when drafting a release. `.github/release.yml` categorizes security, dependency, breaking-change, enhancement, and bug-fix pull requests. Review the generated text before publishing; release notes are not a substitute for the SBOM or security record.

`Dependency security` runs dependency review for pull requests that alter manifests or lockfiles, production npm audits for each Node project on relevant changes and weekly, and CodeQL for JavaScript/TypeScript. Require its checks for `main` in the repository ruleset. Dependabot creates weekly npm and GitHub Actions update pull requests; do not auto-merge security-sensitive dependency changes without the required CODEOWNERS review.

## High-risk release gate and exceptions

Create a **draft** GitHub release first. `Release security gate` then validates the dependency inventory and active exception records, installs from each lockfile, and blocks high- or critical-severity production dependency findings unless every reported GHSA is covered by a valid approved exception. Configure the `release-security` environment with required reviewers who are separate from the release author, and require the `High-risk release approval` check in the release procedure. Publish the draft only after the protected-environment approval and all gate checks pass.

Exceptions are deliberately narrow: add one file under `.github/security-exceptions/` using its README template only when remediation cannot happen before release. It must name the finding, high/critical severity, non-author approver, approval date, expiry date, GitHub tracking issue, and compensating mitigation. The gate rejects malformed or expired records. The release reviewer must independently confirm that the exception covers the live finding; remove the file as soon as the remediation ships. A critical finding requires an explicit compensating control and release-owner approval.

Enable Dependabot alerts and Dependabot security updates in the repository's **Settings > Code security and analysis**. The workflow configuration controls routine version-update pull requests, but alerting and security-update availability are repository settings.

For an incident or audit, preserve the release URL, attached SBOM, checksum manifest, workflow run, relevant dependency alert or CodeQL finding, remediation pull request, and final verification evidence in the security case record.
