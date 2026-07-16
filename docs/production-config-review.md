# Production configuration review

Changes to production-facing configuration run through the `Production configuration review` workflow. The workflow's `production-config-review` job targets GitHub's `production` environment, so it pauses until the environment's required reviewers approve it.

Repository administrators must create the `production` environment in **Settings > Environments** and add at least one required reviewer. Do not add environment secrets to this review job; it only validates policy and dependencies. Make this workflow a required status check for `main` in branch protection or rulesets.

## Configuration boundary

Only non-sensitive, browser-safe values may use the `VITE_` prefix. They are embedded in the frontend build and are public by design. Examples include `VITE_API_URL` and `VITE_EXPLORER_BASE_URL`.

Keep credentials and private operational settings in the deployment platform's secret manager, never in an environment example, frontend environment file, repository variable, image, or workflow log. This includes `JWT_SECRET`, `MONGODB_URI`, `BSC_TESTNET_PRIVATE_KEY`, `SENDGRID_API_KEY`, `BACKUP_ENCRYPTION_KEY`, and restore credentials. Give production application, backup, and restore roles separate secret access as described in [production security](production-security.md).

The policy check rejects populated secret-like entries in committed `.env.example` files and secret-like `VITE_` variables. It also verifies every Node package declares the supported runtime range.
