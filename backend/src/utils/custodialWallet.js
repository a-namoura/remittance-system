import crypto from "crypto";
import { Wallet as EthersWallet } from "ethers";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const configured = String(process.env.CUSTODIAL_WALLET_ENCRYPTION_KEY || "").trim();
  let key;

  if (/^[0-9a-fA-F]{64}$/.test(configured)) {
    key = Buffer.from(configured, "hex");
  } else {
    try {
      key = Buffer.from(configured, "base64");
    } catch {
      key = Buffer.alloc(0);
    }
  }

  if (key.length !== 32) {
    throw new Error(
      "CUSTODIAL_WALLET_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64."
    );
  }
  return key;
}

export function encryptCustodialPrivateKey(privateKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(privateKey), "utf8"),
    cipher.final(),
  ]);

  return {
    encryptedPrivateKey: ciphertext.toString("base64"),
    encryptionIv: iv.toString("base64"),
    encryptionAuthTag: cipher.getAuthTag().toString("base64"),
    encryptionKeyVersion: "v1",
  };
}

export function decryptCustodialPrivateKey(walletDoc) {
  if (!walletDoc?.encryptedPrivateKey || !walletDoc?.encryptionIv || !walletDoc?.encryptionAuthTag) {
    throw new Error("Custodial wallet key material is unavailable.");
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(walletDoc.encryptionIv, "base64")
  );
  decipher.setAuthTag(Buffer.from(walletDoc.encryptionAuthTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(walletDoc.encryptedPrivateKey, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function createCustodialWallet() {
  const wallet = EthersWallet.createRandom();
  return {
    address: wallet.address,
    ...encryptCustodialPrivateKey(wallet.privateKey),
  };
}
