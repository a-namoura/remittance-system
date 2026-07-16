import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { getBackupKey, openDecryptedArchive } from "./encrypted-backup-format.mjs";

const uri = process.env.RESTORE_MONGODB_URI;
const archive = process.env.BACKUP_ARCHIVE_PATH;
const key = getBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
if (!uri || !archive || process.env.RESTORE_CONFIRM !== "restore-only") {
  throw new Error("Set RESTORE_MONGODB_URI, BACKUP_ARCHIVE_PATH, and RESTORE_CONFIRM=restore-only.");
}
const target = new URL(uri);
if (!target.username || !target.password || (target.protocol !== "mongodb+srv:" && target.searchParams.get("tls") !== "true")) {
  throw new Error("Restores require an authenticated TLS MongoDB URI.");
}

const { input, decipher } = await openDecryptedArchive(archive, key);
// Deliberately no --drop: restore must target an empty, isolated database. The
// command only loads archive bytes; it never starts the API or submits a chain tx.
const restore = spawn("mongorestore", ["--uri", uri, "--archive", "--gzip", "--stopOnError"], {
  stdio: ["pipe", "inherit", "pipe"],
});
let stderr = "";
restore.stderr.on("data", (chunk) => { stderr += chunk; });
const restoreExit = new Promise((resolve, reject) => restore.on("close", (code) => code === 0
  ? resolve()
  : reject(new Error(`mongorestore failed (${code}): ${stderr.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[REDACTED]")}`))));
await pipeline(input, decipher, restore.stdin);
await restoreExit;
await import("./restore-reconcile.mjs");
console.info("Encrypted archive restored and all txHash records reconciled. Run npm run restore:check before enabling any application worker.");
