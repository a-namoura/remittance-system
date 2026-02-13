const RSA_ALGORITHM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const RSA_HASH_BY_JWK_ALG = {
  "RSA-OAEP": "SHA-1",
  "RSA-OAEP-256": "SHA-256",
  "RSA-OAEP-384": "SHA-384",
  "RSA-OAEP-512": "SHA-512",
};

const MAX_STORED_IDENTITIES = 6;

function identityStorageKey(userId) {
  return `remittance_chat_identity_${String(userId || "").trim()}`;
}

function ensureCrypto() {
  if (
    typeof window === "undefined" ||
    !window.crypto ||
    !window.crypto.subtle
  ) {
    throw new Error("WebCrypto is unavailable in this browser.");
  }
}

function arrayBufferToBase64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function normalizeBase64(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!normalized) return "";
  const remainder = normalized.length % 4;
  if (remainder === 0) return normalized;
  return `${normalized}${"=".repeat(4 - remainder)}`;
}

function base64ToUint8Array(value) {
  const binary = atob(normalizeBase64(value));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getJwkHashCandidates(jwk) {
  const byAlg = RSA_HASH_BY_JWK_ALG[String(jwk?.alg || "").trim()];
  return unique([byAlg, "SHA-256", "SHA-1"]);
}

function getKeyFingerprint(identity) {
  const publicN = String(identity?.publicKeyJwk?.n || "").trim();
  if (publicN) return `rsa:${publicN}`;
  const privateN = String(identity?.privateKeyJwk?.n || "").trim();
  if (privateN) return `rsa:${privateN}`;
  const publicX = String(identity?.publicKeyJwk?.x || "").trim();
  if (publicX) return `ec:${publicX}`;
  return `fallback:${JSON.stringify(identity?.publicKeyJwk || {})}`;
}

function normalizeIdentityRecord(record) {
  if (!record?.publicKeyJwk || !record?.privateKeyJwk) return null;
  return {
    publicKeyJwk: record.publicKeyJwk,
    privateKeyJwk: record.privateKeyJwk,
    createdAt: record.createdAt || new Date().toISOString(),
  };
}

function normalizeIdentityStore(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      activeFingerprint: "",
      identities: [],
    };
  }

  if (raw.publicKeyJwk && raw.privateKeyJwk) {
    const normalizedLegacy = normalizeIdentityRecord(raw);
    return {
      activeFingerprint: normalizedLegacy ? getKeyFingerprint(normalizedLegacy) : "",
      identities: normalizedLegacy ? [normalizedLegacy] : [],
    };
  }

  const identities = Array.isArray(raw.identities)
    ? raw.identities.map(normalizeIdentityRecord).filter(Boolean)
    : [];

  const deduped = [];
  const seen = new Set();
  for (const identity of identities) {
    const fingerprint = getKeyFingerprint(identity);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    deduped.push(identity);
  }

  return {
    activeFingerprint: String(raw.activeFingerprint || "").trim(),
    identities: deduped,
  };
}

function reorderIdentities({ identities, activeFingerprint }) {
  if (!identities.length) return [];
  const active =
    identities.find((identity) => getKeyFingerprint(identity) === activeFingerprint) ||
    identities[0];
  const activeId = getKeyFingerprint(active);
  const ordered = [
    active,
    ...identities.filter((identity) => getKeyFingerprint(identity) !== activeId),
  ];
  return ordered.slice(0, MAX_STORED_IDENTITIES);
}

function persistIdentityStore(storageKey, identities) {
  if (!storageKey) return;
  if (!identities.length) return;

  const ordered = reorderIdentities({
    identities,
    activeFingerprint: getKeyFingerprint(identities[0]),
  });
  const activeFingerprint = getKeyFingerprint(ordered[0]);

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      activeFingerprint,
      identities: ordered.map((identity) => ({
        publicKeyJwk: identity.publicKeyJwk,
        privateKeyJwk: identity.privateKeyJwk,
        createdAt: identity.createdAt || new Date().toISOString(),
      })),
      createdAt: ordered[0]?.createdAt || new Date().toISOString(),
    })
  );
}

async function importPublicKey(publicKeyJwk, hashName) {
  ensureCrypto();
  return window.crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: hashName },
    true,
    ["encrypt"]
  );
}

async function importPrivateKey(privateKeyJwk, hashName) {
  ensureCrypto();
  return window.crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "RSA-OAEP", hash: hashName },
    true,
    ["decrypt"]
  );
}

async function wrapForPublicKey({ rawAesKey, publicKeyJwk }) {
  const hashCandidates = getJwkHashCandidates(publicKeyJwk);
  let lastError;

  for (const hashName of hashCandidates) {
    try {
      const publicKey = await importPublicKey(publicKeyJwk, hashName);
      return await window.crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        rawAesKey
      );
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to encrypt wrapped chat key.");
}

async function unwrapWithPrivateKey({ wrappedKeyBytes, privateKeyJwk }) {
  const hashCandidates = getJwkHashCandidates(privateKeyJwk);
  let lastError;

  for (const hashName of hashCandidates) {
    try {
      const privateKey = await importPrivateKey(privateKeyJwk, hashName);
      return await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        wrappedKeyBytes
      );
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to decrypt wrapped chat key.");
}

async function isValidIdentityPair({ publicKeyJwk, privateKeyJwk }) {
  try {
    const probe = window.crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapForPublicKey({
      rawAesKey: probe.buffer,
      publicKeyJwk,
    });
    const unwrapped = await unwrapWithPrivateKey({
      wrappedKeyBytes: wrapped,
      privateKeyJwk,
    });
    const lhs = new Uint8Array(probe);
    const rhs = new Uint8Array(unwrapped);
    if (lhs.length !== rhs.length) return false;
    for (let index = 0; index < lhs.length; index += 1) {
      if (lhs[index] !== rhs[index]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function generateIdentityRecord() {
  const keyPair = await window.crypto.subtle.generateKey(RSA_ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]);

  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    window.crypto.subtle.exportKey("jwk", keyPair.publicKey),
    window.crypto.subtle.exportKey("jwk", keyPair.privateKey),
  ]);

  return {
    publicKeyJwk,
    privateKeyJwk,
    createdAt: new Date().toISOString(),
  };
}

export async function getOrCreateChatIdentity(userId) {
  ensureCrypto();
  const storageKey = identityStorageKey(userId);
  const storedValue = window.localStorage.getItem(storageKey);

  let normalizedStore = {
    activeFingerprint: "",
    identities: [],
  };
  if (storedValue) {
    try {
      normalizedStore = normalizeIdentityStore(JSON.parse(storedValue));
    } catch {
      normalizedStore = { activeFingerprint: "", identities: [] };
    }
  }

  const validIdentities = [];
  for (const identity of normalizedStore.identities.slice(0, MAX_STORED_IDENTITIES * 2)) {
    const isValid = await isValidIdentityPair(identity);
    if (isValid) {
      validIdentities.push(identity);
    }
  }

  if (!validIdentities.length) {
    validIdentities.push(await generateIdentityRecord());
  }

  const ordered = reorderIdentities({
    identities: validIdentities,
    activeFingerprint: normalizedStore.activeFingerprint,
  });

  persistIdentityStore(storageKey, ordered);

  return {
    publicKeyJwk: ordered[0].publicKeyJwk,
    privateKeyJwk: ordered[0].privateKeyJwk,
    publicKeyJwks: ordered.map((identity) => identity.publicKeyJwk),
    privateKeyJwks: ordered.map((identity) => identity.privateKeyJwk),
  };
}

export async function encryptForChat({
  plaintext,
  senderPublicKeyJwk,
  recipientPublicKeyJwk,
}) {
  ensureCrypto();
  const text = String(plaintext || "");
  if (!text) {
    throw new Error("Cannot encrypt empty message.");
  }

  if (!senderPublicKeyJwk || !recipientPublicKeyJwk) {
    throw new Error("Both sender and recipient public keys are required.");
  }

  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );

  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const [wrappedKeyForSender, wrappedKeyForRecipient] = await Promise.all([
    wrapForPublicKey({
      rawAesKey,
      publicKeyJwk: senderPublicKeyJwk,
    }),
    wrapForPublicKey({
      rawAesKey,
      publicKeyJwk: recipientPublicKeyJwk,
    }),
  ]);

  const ciphertext = arrayBufferToBase64(ciphertextBuffer);
  const ivBase64 = arrayBufferToBase64(iv);

  return {
    payloadForSender: {
      ciphertext,
      iv: ivBase64,
      wrappedKey: arrayBufferToBase64(wrappedKeyForSender),
    },
    payloadForRecipient: {
      ciphertext,
      iv: ivBase64,
      wrappedKey: arrayBufferToBase64(wrappedKeyForRecipient),
    },
  };
}

function normalizeIncomingPayload(payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload;
  }

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      return { plaintext: trimmed };
    } catch {
      return { plaintext: trimmed };
    }
  }

  return {};
}

function uniquePrivateKeys(primaryKey, privateKeyJwks) {
  const candidates = [];
  const fingerprints = new Set();
  const append = (candidate) => {
    if (!candidate || typeof candidate !== "object") return;
    const fingerprint = getKeyFingerprint({ privateKeyJwk: candidate });
    if (fingerprints.has(fingerprint)) return;
    fingerprints.add(fingerprint);
    candidates.push(candidate);
  };
  append(primaryKey);
  if (Array.isArray(privateKeyJwks)) {
    privateKeyJwks.forEach(append);
  }
  return candidates;
}

export async function decryptChatPayload({
  payload,
  privateKeyJwk,
  privateKeyJwks,
}) {
  ensureCrypto();
  const normalizedPayload = normalizeIncomingPayload(payload);

  const ciphertext = String(normalizedPayload?.ciphertext || "").trim();
  const iv = String(normalizedPayload?.iv || "").trim();
  const wrappedKey = String(normalizedPayload?.wrappedKey || "").trim();

  if (!ciphertext || !iv || !wrappedKey) {
    if (String(normalizedPayload?.plaintext || "").trim()) {
      return String(normalizedPayload.plaintext);
    }
    if (String(normalizedPayload?.text || "").trim()) {
      return String(normalizedPayload.text);
    }
    throw new Error("Encrypted payload is missing required fields.");
  }

  const keyCandidates = uniquePrivateKeys(privateKeyJwk, privateKeyJwks);
  if (!keyCandidates.length) {
    throw new Error("privateKeyJwk is required.");
  }

  const wrappedKeyBytes = base64ToUint8Array(wrappedKey);
  const ivBytes = base64ToUint8Array(iv);
  const cipherBytes = base64ToUint8Array(ciphertext);

  let lastError;
  for (const candidatePrivateKey of keyCandidates) {
    try {
      const rawAesKey = await unwrapWithPrivateKey({
        wrappedKeyBytes,
        privateKeyJwk: candidatePrivateKey,
      });

      const aesKey = await window.crypto.subtle.importKey(
        "raw",
        rawAesKey,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );

      const plaintextBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes },
        aesKey,
        cipherBytes
      );

      return new TextDecoder().decode(plaintextBuffer);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Unable to decrypt message payload.");
}

