# Production security operations

## Transport and database

Set `NODE_ENV=production`, `FRONTEND_URL`, external `API_URL`, and frontend `VITE_API_URL` to HTTPS URLs. The API rejects HTTP production origins, redirects non-TLS proxy requests to HTTPS, and emits HSTS; the production frontend build also rejects a non-HTTPS API endpoint. Terminate TLS at a managed load balancer/reverse proxy and forward `X-Forwarded-Proto: https`.

Use a separate authenticated application database account; do not use an Atlas/admin/root account. Give it only `readWrite` on `remittance`:

```javascript
use remittance
db.createUser({ user: "remittance_app", pwd: passwordPrompt(), roles: [{ role: "readWrite", db: "remittance" }] })
```

Set `MONGODB_URI` to an authenticated TLS URI (`mongodb+srv://...` or `mongodb://...?tls=true`). Production startup rejects unauthenticated or non-TLS connections.

## Encrypted backups

Run `npm run backup:encrypted` under a dedicated backup service role, using a separate MongoDB user with only the privileges needed for backup reads. Set `BACKUP_ENCRYPTION_KEY` to a secret-manager supplied 32-byte base64 key and `BACKUP_OUTPUT_DIR` to a service-role-only mount. The command writes AES-256-GCM encrypted `RMBK1` archive files with owner-only permissions; never commit the key or backup artifacts.

Upload the encrypted files to a private backup bucket with encryption-at-rest enabled. Grant the backup service role write/list access only; grant restore personnel a separate, time-bound read role. Deny public access, require TLS, enable retention/versioning, and test encrypted restores regularly. Keep production application credentials, backup key access, and bucket access as three distinct identities.

## Restore procedure and integrity checklist

Restore only into a newly created, isolated TLS database. Do not start the API, reconciliation worker, or any blockchain-enabled process while restoring. Set `RESTORE_MONGODB_URI` to that database, `BACKUP_ARCHIVE_PATH` to the encrypted archive, `BACKUP_ENCRYPTION_KEY` to the matching key, and explicitly acknowledge the restore-only operation:

```sh
RESTORE_CONFIRM=restore-only npm run restore:encrypted
RESTORE_CHECK_CONFIRM=check-only npm run restore:check
```

The restore command decrypts and authenticates the `RMBK1` archive before piping it only to `mongorestore`; it does not import application code and cannot submit or rebroadcast a blockchain transaction. It intentionally omits `--drop`, so use an empty target database. The integrity check confirms unique transaction hashes plus payment-link-to-transaction hash and transaction-to-payment-link references. Treat any failure as a failed restore: discard the isolated target and investigate the archive/key before retrying. Record the archive identifier, target database, check output, and operator in the recovery ticket before making the database available to the application.
