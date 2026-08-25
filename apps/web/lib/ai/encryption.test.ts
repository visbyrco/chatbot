import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY = "test-encryption-key-32-bytes-long!!123456";

describe("encryption round-trip", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = TEST_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = originalKey;
    }
    vi.restoreAllMocks();
  });

  it("encrypts and decrypts round-trip with random salt", async () => {
    const { encrypt, decrypt } = await import("./encryption");
    const plaintext = "sk-test-api-key-12345";
    const { encrypted, iv, salt, keyVersion } = encrypt(plaintext);
    expect(encrypted).toContain(":");
    expect(iv).toMatch(/^[0-9a-f]{32}$/);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(keyVersion).toBe(1);
    const decrypted = decrypt(encrypted, iv, salt);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts with explicit saltHex", async () => {
    const { encrypt, decrypt } = await import("./encryption");
    const plaintext = "hello world";
    const saltHex = "a".repeat(32);
    const { encrypted, iv, salt } = encrypt(plaintext, { saltHex });
    expect(salt).toBe(saltHex);
    expect(decrypt(encrypted, iv, salt)).toBe(plaintext);
  });

  it("round-trips unicode and long strings", async () => {
    const { encrypt, decrypt } = await import("./encryption");
    for (const pt of [
      "🔑 emoji key ✓",
      "a".repeat(5000),
      "line\nbreak\ttab",
      " ",
    ]) {
      const { encrypted, iv, salt } = encrypt(pt);
      expect(decrypt(encrypted, iv, salt)).toBe(pt);
    }
  });

  it("produces different ciphertexts for same plaintext", async () => {
    const { encrypt } = await import("./encryption");
    const pt = "same-plaintext";
    const a = encrypt(pt);
    const b = encrypt(pt);
    // iv is random, so payloads differ
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails to decrypt with tampered authTag", async () => {
    const { encrypt, decrypt } = await import("./encryption");
    const { encrypted, iv, salt } = encrypt("secret");
    const [ct, tag] = encrypted.split(":");
    const tampered = `${ct}:${tag.slice(0, -2)}aa`;
    expect(() => decrypt(tampered, iv, salt)).toThrow();
  });

  it("fails to decrypt with wrong iv", async () => {
    const { encrypt, decrypt } = await import("./encryption");
    const { encrypted, salt } = encrypt("secret");
    const wrongIv = "00".repeat(16);
    expect(() => decrypt(encrypted, wrongIv, salt)).toThrow();
  });

  it("fails to decrypt with wrong salt", async () => {
    const { encrypt, decrypt } = await import("./encryption");
    const { encrypted, iv } = encrypt("secret");
    const wrongSalt = "ff".repeat(16);
    expect(() => decrypt(encrypted, iv, wrongSalt)).toThrow();
  });

  it("decrypts legacy payload without salt (hkdf fallback to sha256)", async () => {
    const { encrypt, decrypt } = await import("./encryption");
    // Create legacy-style encryption by using getLegacyKey path: decrypt without salt
    // We simulate by encrypting with current and then decrypting legacy by mocking?
    // Instead test that decrypt without salt uses legacy key and fails for current payload
    const { encrypted, iv } = encrypt("legacy-test");
    // decrypting without salt should fail because key differs
    expect(() => decrypt(encrypted, iv, null)).toThrow();
    expect(() => decrypt(encrypted, iv, undefined)).toThrow();
    // but valid without salt for legacy encrypt: we create legacy encrypt manually
    const crypto = await import("node:crypto");
    const legacyKey = crypto.createHash("sha256").update(TEST_KEY).digest();
    const legacyIv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", legacyKey, legacyIv);
    let enc = cipher.update("legacy-plaintext", "utf8", "base64");
    enc += cipher.final("base64");
    const tag = cipher.getAuthTag().toString("base64");
    const payload = `${enc}:${tag}`;
    expect(decrypt(payload, legacyIv.toString("hex"), null)).toBe(
      "legacy-plaintext"
    );
    expect(decrypt(payload, legacyIv.toString("hex"), undefined)).toBe(
      "legacy-plaintext"
    );
  });

  it("throws on invalid payload format", async () => {
    const { decrypt } = await import("./encryption");
    expect(() => decrypt("no-colon", "00".repeat(16), "aa".repeat(16))).toThrow(
      "Invalid encrypted payload"
    );
    expect(() => decrypt(":", "00".repeat(16), "aa".repeat(16))).toThrow();
    expect(() => decrypt("a:b:c", "00".repeat(16), "aa".repeat(16))).toThrow();
  });

  it("throws when ENCRYPTION_KEY is missing", async () => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
    const { encrypt } = await import("./encryption");
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY is required");
  });

  it("needsReEncrypt returns true for missing salt or old version", async () => {
    const { needsReEncrypt, CURRENT_KEY_VERSION } = await import(
      "./encryption"
    );
    expect(needsReEncrypt(null, null)).toBe(true);
    expect(needsReEncrypt(0, null)).toBe(true);
    expect(needsReEncrypt(0, "abc")).toBe(true);
    expect(needsReEncrypt(CURRENT_KEY_VERSION, "salt")).toBe(false);
    expect(needsReEncrypt(CURRENT_KEY_VERSION, null)).toBe(true);
    expect(needsReEncrypt(undefined, "salt")).toBe(true);
  });

  it("round-trip with explicit keyVersion", async () => {
    const { encrypt, decrypt } = await import("./encryption");
    const { encrypted, iv, salt, keyVersion } = encrypt("kv-test", {
      keyVersion: 1,
    });
    expect(keyVersion).toBe(1);
    expect(decrypt(encrypted, iv, salt)).toBe("kv-test");
  });
});
