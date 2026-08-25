import "server-only";

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const INFO = "chatbot-provider-key";
export const CURRENT_KEY_VERSION = 1;

function warnIfWeakKey(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    // Production hard-fail is centralized in lib/env.ts; here we only warn so dev stays usable.
    console.warn(
      "[encryption] ENCRYPTION_KEY is shorter than 32 bytes – use a high-entropy random key (e.g. `openssl rand -base64 32`)."
    );
  }
}

function getKey(salt: Buffer): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("ENCRYPTION_KEY is required for API key encryption");
  }
  warnIfWeakKey(secret);
  const derived = crypto.hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    salt,
    INFO,
    32
  ) as unknown as ArrayBuffer | Buffer;
  return Buffer.isBuffer(derived)
    ? derived
    : Buffer.from(derived as ArrayBuffer);
}

function getLegacyKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("ENCRYPTION_KEY is required for API key encryption");
  }
  warnIfWeakKey(secret);
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(
  plaintext: string,
  opts?: { saltHex?: string; keyVersion?: number }
): { encrypted: string; iv: string; salt: string; keyVersion: number } {
  const salt = opts?.saltHex
    ? Buffer.from(opts.saltHex, "hex")
    : crypto.randomBytes(16);
  const key = getKey(salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag().toString("base64");

  // zeroize key material
  key.fill(0);

  return {
    encrypted: `${encrypted}:${authTag}`,
    iv: iv.toString("hex"),
    keyVersion: opts?.keyVersion ?? CURRENT_KEY_VERSION,
    salt: salt.toString("hex"),
  };
}

export function decrypt(
  encryptedPayload: string,
  ivHex: string,
  saltHex?: string | null
): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted payload");
  }
  const [encrypted, authTag] = parts;
  if (!authTag) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = Buffer.from(ivHex, "hex");
  const salt = saltHex ? Buffer.from(saltHex, "hex") : null;
  const key = salt ? getKey(salt) : getLegacyKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  key.fill(0);

  return decrypted;
}

export function needsReEncrypt(
  keyVersion?: number | null,
  salt?: string | null
): boolean {
  return !salt || (keyVersion ?? 0) < CURRENT_KEY_VERSION;
}
