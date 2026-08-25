import { beforeEach, describe, expect, it, vi } from "vitest";

describe("isAllowedModelId", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns false for non-custom model ids without DB call", async () => {
    const mockFn = vi.fn();
    vi.doMock("@/lib/db/queries", () => ({
      getCustomModelsByProviderId: mockFn,
    }));
    const { isAllowedModelId } = await import("./models");
    await expect(isAllowedModelId("gpt-4o")).resolves.toBe(false);
    await expect(isAllowedModelId("claude-3")).resolves.toBe(false);
    await expect(isAllowedModelId("")).resolves.toBe(false);
    expect(mockFn).not.toHaveBeenCalled();
  });

  it("returns true when model exists for provider", async () => {
    vi.doMock("@/lib/db/queries", () => ({
      getCustomModelsByProviderId: vi
        .fn()
        .mockResolvedValue([{ modelId: "my-model" }]),
    }));
    const { isAllowedModelId } = await import("./models");
    await expect(isAllowedModelId("custom-provider123/my-model")).resolves.toBe(
      true
    );
  });

  it("returns false when model not found for provider", async () => {
    vi.doMock("@/lib/db/queries", () => ({
      getCustomModelsByProviderId: vi
        .fn()
        .mockResolvedValue([{ modelId: "other-model" }]),
    }));
    const { isAllowedModelId } = await import("./models");
    await expect(isAllowedModelId("custom-provider123/my-model")).resolves.toBe(
      false
    );
  });

  it("handles nested modelId with slashes", async () => {
    vi.doMock("@/lib/db/queries", () => ({
      getCustomModelsByProviderId: vi
        .fn()
        .mockResolvedValue([{ modelId: "a/b/c" }]),
    }));
    const { isAllowedModelId } = await import("./models");
    await expect(isAllowedModelId("custom-p1/a/b/c")).resolves.toBe(true);
    await expect(isAllowedModelId("custom-p1/a/b")).resolves.toBe(false);
  });

  it("extracts providerId correctly from custom- prefix", async () => {
    const spy = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/db/queries", () => ({
      getCustomModelsByProviderId: spy,
    }));
    const { isAllowedModelId } = await import("./models");
    await isAllowedModelId("custom-abc123/some-model");
    expect(spy).toHaveBeenCalledWith({ providerId: "abc123" });
  });

  it("handles custom- with empty model part", async () => {
    vi.doMock("@/lib/db/queries", () => ({
      getCustomModelsByProviderId: vi.fn().mockResolvedValue([{ modelId: "" }]),
    }));
    const { isAllowedModelId } = await import("./models");
    // modelId = "custom-provider/" => modelName = ""
    await expect(isAllowedModelId("custom-provider/")).resolves.toBe(true);
  });

  it("handles multiple models in DB", async () => {
    vi.doMock("@/lib/db/queries", () => ({
      getCustomModelsByProviderId: vi
        .fn()
        .mockResolvedValue([
          { modelId: "m1" },
          { modelId: "m2" },
          { modelId: "m3" },
        ]),
    }));
    const { isAllowedModelId } = await import("./models");
    await expect(isAllowedModelId("custom-p/m2")).resolves.toBe(true);
    await expect(isAllowedModelId("custom-p/m4")).resolves.toBe(false);
  });

  it("returns false for malformed custom- id with no provider part", async () => {
    vi.doMock("@/lib/db/queries", () => ({
      getCustomModelsByProviderId: vi.fn().mockResolvedValue([]),
    }));
    const { isAllowedModelId } = await import("./models");
    // "custom-" => providerId = ""
    await expect(isAllowedModelId("custom-")).resolves.toBe(false);
  });
});
