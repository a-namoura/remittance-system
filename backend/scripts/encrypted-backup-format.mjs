import { createDecipheriv } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";

export const BACKUP_MAGIC = Buffer.from("RMBK1");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = BACKUP_MAGIC.length + IV_LENGTH;

export function getBackupKey(value) {
  const key = Buffer.from(value || "", "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be a 32-byte base64 key.");
  return key;
}

// Returns only the decrypted mongodump archive stream. It never imports or calls
// application/blockchain code, so a restore cannot broadcast a transaction.
export async function openDecryptedArchive(path, key) {
  const file = await open(path, "r");
  try {
    const { size } = await stat(path);
    if (size <= HEADER_LENGTH + TAG_LENGTH) throw new Error("Backup archive is truncated.");
    const header = Buffer.alloc(HEADER_LENGTH);
    await file.read(header, 0, header.length, 0);
    if (!header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
      throw new Error("Backup archive is not an RMBK1 encrypted archive.");
    }
    const tag = Buffer.alloc(TAG_LENGTH);
    await file.read(tag, 0, tag.length, size - TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(BACKUP_MAGIC.length));
    decipher.setAuthTag(tag);
    return {
      input: createReadStream(path, { start: HEADER_LENGTH, end: size - TAG_LENGTH - 1 }),
      decipher,
    };
  } finally {
    await file.close();
  }
}
