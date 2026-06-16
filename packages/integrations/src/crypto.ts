// packages/integrations/src/crypto.ts
//
// AES-256-GCM envelope for OAuth tokens at rest. We never want a raw
// access_token / refresh_token sitting in MongoDB — if a backup leaks or a
// developer accidentally `.find().lean()`s an account row into a log, the
// blast radius should be encrypted nonsense, not a working Instagram token.
//
// Key derivation: the operator supplies INTEGRATIONS_ENCRYPTION_KEY as 64
// hex chars (= 32 bytes). Rotation is out-of-scope for the POC; pin one key
// and rebuild the SocialAccount collection if you ever rotate it.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw) {
    // Dev convenience: derive a key from JWT_SECRET via scrypt so first-run
    // doesn't crash, but warn loudly. Production MUST set
    // INTEGRATIONS_ENCRYPTION_KEY explicitly to a fixed value so tokens
    // remain decryptable across restarts.
    const jwt = process.env.JWT_SECRET;
    if (!jwt) {
      throw new Error(
        "INTEGRATIONS_ENCRYPTION_KEY is required to encrypt OAuth tokens. Generate one with `openssl rand -hex 32`."
      );
    }
    cachedKey = scryptSync(jwt, "integrations-salt-v1", 32);
    return cachedKey;
  }

  if (raw.length !== 64 || !/^[0-9a-f]+$/i.test(raw)) {
    throw new Error(
      "INTEGRATIONS_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Generate with `openssl rand -hex 32`."
    );
  }

  cachedKey = Buffer.from(raw, "hex");
  return cachedKey;
}

// Returns a self-contained ciphertext string of the form
// "v1:<iv hex>:<tag hex>:<ciphertext hex>" so callers do not have to track
// the IV / auth tag separately. The "v1" prefix leaves room for future
// algorithm bumps without ambiguity.
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString(
    "hex"
  )}`;
}

export function decryptSecret(payload: string): string {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Encrypted payload has unexpected format");
  }
  const iv = Buffer.from(parts[1]!, "hex");
  const tag = Buffer.from(parts[2]!, "hex");
  const ct = Buffer.from(parts[3]!, "hex");
  if (tag.length !== TAG_BYTES) {
    throw new Error("Encrypted payload has invalid auth tag");
  }
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}
