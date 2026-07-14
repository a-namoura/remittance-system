import { createCipheriv, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, chmod } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";

const uri = process.env.MONGODB_URI;
const outputDir = process.env.BACKUP_OUTPUT_DIR;
const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || "", "base64");
if (!uri || !outputDir || key.length !== 32) throw new Error("Set MONGODB_URI, BACKUP_OUTPUT_DIR, and a 32-byte base64 BACKUP_ENCRYPTION_KEY.");
const mongoUrl = new URL(uri);
if (!mongoUrl.username || !mongoUrl.password || (mongoUrl.protocol !== "mongodb+srv:" && mongoUrl.searchParams.get("tls") !== "true")) {
  throw new Error("Backups require an authenticated TLS MongoDB URI.");
}
const destination = resolve(outputDir);
await mkdir(destination, { recursive: true, mode: 0o700 });
await chmod(destination, 0o700);
const filename = `remittance-${new Date().toISOString().replace(/[:.]/g, "-")}.archive.enc`;
const path = join(destination, filename);
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const dump = spawn("mongodump", ["--uri", uri, "--archive", "--gzip"], { stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
dump.stderr.on("data", (chunk) => { stderr += chunk; });
const dumpExit = new Promise((resolveExit, reject) => dump.on("close", (code) => code === 0 ? resolveExit() : reject(new Error(`mongodump failed (${code}): ${stderr.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[REDACTED]")}`))));
const output = createWriteStream(path, { mode: 0o600 });
output.write(Buffer.from("RMBK1"));
output.write(iv);
await pipeline(dump.stdout, cipher, output);
await dumpExit;
const tag = cipher.getAuthTag();
await new Promise((resolveFinish, reject) => { const tagOutput = createWriteStream(path, { flags: "a", mode: 0o600 }); tagOutput.end(tag, resolveFinish); tagOutput.on("error", reject); });
console.info(`Encrypted backup created: ${filename}`);
