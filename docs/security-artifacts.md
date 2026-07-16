# Security artifacts and release records

Every published GitHub release triggers `Release security artifacts`. It creates a CycloneDX JSON SBOM, a SHA-256 checksum manifest, and a release-security record containing the release tag, source revision, workflow-run URL, and SBOM format. The workflow attaches all three files to the GitHub release and retains the workflow copy for 90 days.

Use **Generate release notes** when drafting a release. `.github/release.yml` categorizes security, dependency, breaking-change, enhancement, and bug-fix pull requests. Review the generated text before publishing; release notes are not a substitute for the SBOM or security record.

`Dependency security` runs dependency review for pull requests that alter manifests or lockfiles, production npm audits for each Node project on relevant changes and weekly, and CodeQL for JavaScript/TypeScript. Require its checks for `main` in the repository ruleset. Dependabot creates weekly npm and GitHub Actions update pull requests; do not auto-merge security-sensitive dependency changes without the required CODEOWNERS review.

Enable Dependabot alerts and Dependabot security updates in the repository's **Settings > Code security and analysis**. The workflow configuration controls routine version-update pull requests, but alerting and security-update availability are repository settings.

For an incident or audit, preserve the release URL, attached SBOM, checksum manifest, workflow run, relevant dependency alert or CodeQL finding, remediation pull request, and final verification evidence in the security case record.
