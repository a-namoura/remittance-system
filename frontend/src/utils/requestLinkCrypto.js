function encodeBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function canonicalPayment({ walletAddress, amount, assetSymbol }) {
  return [
    String(walletAddress || "").trim().toLowerCase(),
    String(Number(amount)),
    String(assetSymbol || "").trim().toUpperCase(),
  ].join("|");
}

export async function createPaymentCommitment(payment) {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonicalPayment(payment))));
  return { commitmentKey: encodeBase64Url(rawKey), paymentCommitment: encodeBase64Url(signature) };
}

export async function encryptRequestPayload(payload) {
  if (!globalThis.crypto?.subtle) throw new Error("Secure link encryption is unavailable.");
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return {
    encryptedPayload: JSON.stringify({ v: 1, iv: encodeBase64Url(iv), data: encodeBase64Url(ciphertext) }),
    encryptionKey: encodeBase64Url(rawKey),
  };
}

export async function decryptRequestPayload(encryptedPayload, encryptionKey) {
  if (!globalThis.crypto?.subtle) throw new Error("Secure link decryption is unavailable.");
  const envelope = JSON.parse(String(encryptedPayload || ""));
  if (envelope?.v !== 1 || !envelope.iv || !envelope.data) throw new Error("Invalid encrypted request.");
  const key = await crypto.subtle.importKey("raw", decodeBase64Url(encryptionKey), "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(envelope.iv) },
    key,
    decodeBase64Url(envelope.data)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}
