# Security review and access controls

## Pull-request approval requirement

`.github/CODEOWNERS` assigns the security-sensitive paths to the repository security owner. For an organization repository, replace `@a-namoura` with a dedicated security-review team before enabling enforcement.

Repository administrators must configure a ruleset (or branch protection) for `main` with all of the following:

- Require a pull request before merging, with at least one approval from someone other than the pull-request author.
- Require review from Code Owners and dismiss stale approvals when new commits are pushed.
- Require the `Security approval` status check from the `Security review` workflow.
- Restrict direct pushes, force pushes, and branch deletion.

Also create the `security-review` environment in **Settings > Environments** and add at least one required reviewer. The workflow deliberately receives no environment secrets; its protected-environment pause makes the security approval visible to the PR. Use a reviewer who is not the PR author.

The `production` environment and its configuration-review requirement remain separate; changes that match both policies need both approvals.

## Least privilege and MFA

Use separate, named GitHub identities for routine development, security review, release administration, and automation. Grant each identity or team the lowest repository role that permits its work: developers should not receive admin access; reviewers need only the access required to review; and automation should use narrowly scoped, short-lived tokens.

Limit write and bypass permissions for `main` to a small release-admin group. Do not grant ruleset bypass to regular developers, and review the group membership at least quarterly and after role changes. Remove inactive accounts and deploy keys promptly. Prefer GitHub Apps or fine-grained tokens with repository-only permissions and expiration; never use personal access tokens or workflow secrets with broader organization access than necessary.

Require multi-factor authentication for every organization member, outside collaborator with repository access, and administrator. Prefer phishing-resistant passkeys or hardware security keys. Store recovery codes in the approved password manager, require reauthentication for sensitive GitHub actions, and immediately revoke sessions, tokens, and recovery methods when an account may be compromised.
