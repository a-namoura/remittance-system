import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import test from "node:test";
import { BACKUP_MAGIC, openDecryptedArchive } from "../scripts/encrypted-backup-format.mjs";

test("encrypted restore reader authenticates RMBK1 archives without changing transaction data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "remittance-restore-"));
  const archive = join(dir, "backup.archive.enc");
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const original = Buffer.from('{"txHash":"0xpreserved","paymentLinkId":"link-1"}');
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(original), cipher.final()]);
  await writeFile(archive, Buffer.concat([BACKUP_MAGIC, iv, encrypted, cipher.getAuthTag()]));
  const { input, decipher } = await openDecryptedArchive(archive, key);
  const chunks = [];
  await pipeline(input, decipher, new Writable({ write(chunk, _encoding, done) { chunks.push(chunk); done(); } }));
  assert.deepEqual(Buffer.concat(chunks), original);
  const wrongKeyReader = await openDecryptedArchive(archive, randomBytes(32));
  await assert.rejects(pipeline(
    wrongKeyReader.input,
    wrongKeyReader.decipher,
    new Writable({ write(_chunk, _encoding, done) { done(); } })
  ));
  await rm(dir, { recursive: true, force: true });
});
