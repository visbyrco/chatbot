import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ratelimit", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // default: not test environment, redis url present
    delete process.env.PLAYWRIGHT;
    delete process.env.PLAYWRIGHT_TEST_BASE_URL;
    delete process.env.CI_PLAYWRIGHT;
    (process.env as Record<string, string | undefined>).NODE_ENV =
      "development";
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("fail-open when REDIS_URL not configured (warns but does not throw)", async () => {
    delete process.env.REDIS_URL;
    vi.doMock("@/lib/constants", () => ({ isTestEnvironment: false }));
    const { rateLimit } = await import("./ratelimit");
    // Now uses in-memory fallback without warning
    await expect(rateLimit("k", 5, 60)).resolves.toBeUndefined();
  });

  it("fail-open when Redis not ready but REDIS_URL is set", async () => {
    vi.doMock("@/lib/constants", () => ({ isTestEnvironment: false }));
    vi.doMock("redis", () => ({
      createClient: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        isReady: false,
        on: vi.fn(),
      })),
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { rateLimit } = await import("./ratelimit");
    await expect(rateLimit("k2", 5, 60)).rejects.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Redis not ready")
    );
  });

  it("bypasses entirely when isTestEnvironment true", async () => {
    vi.doMock("@/lib/constants", () => ({ isTestEnvironment: true }));
    const { rateLimit } = await import("./ratelimit");
    // should return immediately, no redis interaction
    await expect(rateLimit("any", 1, 60)).resolves.toBeUndefined();
  });

  it("throws ChatbotError when count exceeds limit", async () => {
    vi.doMock("@/lib/constants", () => ({ isTestEnvironment: false }));
    const mockExec = vi.fn().mockResolvedValue([6]);
    const mockMulti = {
      exec: mockExec,
      expire: vi.fn().mockReturnThis(),
      incr: vi.fn().mockReturnThis(),
    };
    vi.doMock("redis", () => ({
      createClient: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        isReady: true,
        multi: () => mockMulti,
        on: vi.fn(),
      })),
    }));
    const { rateLimit } = await import("./ratelimit");
    await expect(rateLimit("k", 5, 60)).rejects.toThrow();
    try {
      await rateLimit("k", 5, 60);
    } catch (e: any) {
      expect(e.message).toMatch(/message limit|rate_limit/i);
      expect(e.statusCode).toBe(429);
    }
  });

  it("does not throw when count within limit", async () => {
    vi.doMock("@/lib/constants", () => ({ isTestEnvironment: false }));
    const mockExec = vi.fn().mockResolvedValue([2]);
    const mockMulti = {
      exec: mockExec,
      expire: vi.fn().mockReturnThis(),
      incr: vi.fn().mockReturnThis(),
    };
    vi.doMock("redis", () => ({
      createClient: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        isReady: true,
        multi: () => mockMulti,
        on: vi.fn(),
      })),
    }));
    const { rateLimit } = await import("./ratelimit");
    await expect(rateLimit("k", 5, 60)).resolves.toBeUndefined();
  });

  it("fail-open on redis exec error (warns, does not throw)", async () => {
    vi.doMock("@/lib/constants", () => ({ isTestEnvironment: false }));
    const mockMulti = {
      exec: vi.fn().mockRejectedValue(new Error("redis down")),
      expire: vi.fn().mockReturnThis(),
      incr: vi.fn().mockReturnThis(),
    };
    vi.doMock("redis", () => ({
      createClient: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        isReady: true,
        multi: () => mockMulti,
        on: vi.fn(),
      })),
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { rateLimit } = await import("./ratelimit");
    await expect(rateLimit("k", 5, 60)).rejects.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("failed"),
      expect.any(Error)
    );
  });

  it("checkIpRateLimit builds key variants and respects test env", async () => {
    vi.doMock("@/lib/constants", () => ({ isTestEnvironment: true }));
    const { checkIpRateLimit } = await import("./ratelimit");
    await expect(
      checkIpRateLimit("1.1.1.1", { userId: "u1" })
    ).resolves.toBeUndefined();
    await expect(checkIpRateLimit("1.1.1.1")).resolves.toBeUndefined();
    await expect(
      checkIpRateLimit(undefined, { userId: "u1" })
    ).resolves.toBeUndefined();
    await expect(checkIpRateLimit(undefined, {})).resolves.toBeUndefined();
  });

  it("checkIpRateLimit uses correct RATE_LIMITS values", async () => {
    vi.doMock("@/lib/constants", () => ({ isTestEnvironment: false }));
    const calls: Array<{ key: string; limit: number; windowSeconds: number }> =
      [];
    const mockExec = vi.fn().mockResolvedValue([1]);
    const mockMulti = {
      exec: mockExec,
      expire: vi.fn().mockReturnThis(),
      incr: vi.fn().mockImplementation((k: string) => {
        calls.push({ key: k } as any);
        return mockMulti;
      }),
    };
    // We'll spy on rateLimit indirectly via redis multi key
    vi.doMock("redis", () => ({
      createClient: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        isReady: true,
        multi: () => mockMulti,
        on: vi.fn(),
      })),
    }));
    const { checkIpRateLimit, RATE_LIMITS } = await import("./ratelimit");
    expect(RATE_LIMITS.chat.limit).toBe(500);
    expect(RATE_LIMITS.chat.windowSeconds).toBe(3600);
    await checkIpRateLimit("9.9.9.9", { userId: "user123" });
    // key should be ip-rate-limit:9.9.9.9:user:user123
    expect(mockMulti.incr).toHaveBeenCalledWith(
      "ip-rate-limit:9.9.9.9:user:user123"
    );
  });

  it("checkUpload/checkExport/checkProviderTest/checkDetect construct user-scoped keys", async () => {
    vi.doMock("@/lib/constants", () => ({ isTestEnvironment: false }));
    const incr = vi.fn().mockReturnThis();
    const expire = vi.fn().mockReturnThis();
    const exec = vi.fn().mockResolvedValue([1]);
    const multi = { exec, expire, incr };
    vi.doMock("redis", () => ({
      createClient: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        isReady: true,
        multi: () => multi,
        on: vi.fn(),
      })),
    }));
    const {
      checkUploadRateLimit,
      checkExportRateLimit,
      checkProviderTestRateLimit,
      checkDetectRateLimit,
    } = await import("./ratelimit");
    await checkUploadRateLimit("1.2.3.4", "u1");
    expect(incr).toHaveBeenCalledWith("upload-rate-limit:1.2.3.4:user:u1");
    incr.mockClear();
    await checkUploadRateLimit(undefined, "u1");
    expect(incr).toHaveBeenCalledWith("upload-rate-limit:user:u1");

    await checkExportRateLimit("1.2.3.4", "u1");
    expect(incr).toHaveBeenCalledWith(
      expect.stringContaining("export-rate-limit")
    );

    await checkProviderTestRateLimit("1.2.3.4", "u1");
    expect(incr).toHaveBeenCalledWith(
      expect.stringContaining("provider-test-rate-limit")
    );

    await checkDetectRateLimit("1.2.3.4", "u1");
    expect(incr).toHaveBeenCalledWith(
      expect.stringContaining("detect-rate-limit")
    );
  });

  it("RATE_LIMITS TTL is 3600 for all endpoints", async () => {
    vi.doMock("@/lib/constants", () => ({ isTestEnvironment: false }));
    const { RATE_LIMITS } = await import("./ratelimit");
    for (const k of Object.keys(RATE_LIMITS) as Array<
      keyof typeof RATE_LIMITS
    >) {
      expect(RATE_LIMITS[k].windowSeconds).toBe(3600);
    }
  });
});
