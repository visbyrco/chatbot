import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ZEN_PROVIDER = {
  baseURL: "https://opencode.ai/zen/go/v1",
  name: "Zen",
  providerKey: "opencode-go",
  type: "openai",
} as const;

function mockCatalog(catalogModel: unknown, npm?: string) {
  vi.doMock("./catalog", () => ({
    getCatalogProvider: vi
      .fn()
      .mockReturnValue(npm === undefined ? undefined : { npm }),
    getLiveCatalogModel: vi.fn().mockResolvedValue(catalogModel),
  }));
}

async function importRouting(catalogModel: unknown, npm?: string) {
  mockCatalog(catalogModel, npm);
  vi.doMock("@/lib/db/queries", () => ({
    getCustomProviderById: vi.fn(),
  }));
  vi.doMock("./encryption", () => ({
    decrypt: vi.fn().mockReturnValue("test-key"),
  }));
  return await import("./providers");
}

describe("getCustomModelRouting", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("routes per-model @ai-sdk/openai overrides to the Responses API", async () => {
    const { getCustomModelRouting } = await importRouting(
      { apiShape: undefined, npmOverride: "@ai-sdk/openai" },
      "@ai-sdk/openai-compatible"
    );
    await expect(
      getCustomModelRouting({ ...ZEN_PROVIDER }, "muse-spark-1.3-contributor")
    ).resolves.toEqual({
      providerOptionsKey: "openai",
      sendReasoningEffort: true,
      useAnthropicApi: false,
      useResponsesApi: true,
    });
  });

  it("routes per-model @ai-sdk/anthropic overrides to the Messages API", async () => {
    const { getCustomModelRouting } = await importRouting(
      {
        apiShape: undefined,
        npmOverride: "@ai-sdk/anthropic",
        outputLimit: 131_072,
      },
      "@ai-sdk/openai-compatible"
    );
    await expect(
      getCustomModelRouting({ ...ZEN_PROVIDER }, "minimax-m3")
    ).resolves.toEqual({
      maxOutputTokens: 131_072,
      providerOptionsKey: "anthropic",
      sendReasoningEffort: true,
      useAnthropicApi: true,
      useResponsesApi: false,
    });
  });

  it("routes apiShape responses to the Responses API", async () => {
    const { getCustomModelRouting } = await importRouting(
      { apiShape: "responses", npmOverride: undefined },
      "@ai-sdk/openai-compatible"
    );
    await expect(
      getCustomModelRouting({ ...ZEN_PROVIDER }, "some-model")
    ).resolves.toMatchObject({ useResponsesApi: true });
  });

  it("keeps apiShape completions on chat completions", async () => {
    const { getCustomModelRouting } = await importRouting(
      { apiShape: "completions", npmOverride: "@ai-sdk/openai" },
      "@ai-sdk/openai-compatible"
    );
    await expect(
      getCustomModelRouting({ ...ZEN_PROVIDER }, "kimi-k2.7-code")
    ).resolves.toEqual({
      providerOptionsKey: "opencode-go",
      sendReasoningEffort: true,
      useAnthropicApi: false,
      useResponsesApi: false,
    });
  });

  it("keeps models without a catalog entry on chat completions", async () => {
    const { getCustomModelRouting } = await importRouting(
      undefined,
      "@ai-sdk/openai-compatible"
    );
    await expect(
      getCustomModelRouting({ ...ZEN_PROVIDER }, "unknown-model")
    ).resolves.toEqual({
      providerOptionsKey: "opencode-go",
      sendReasoningEffort: true,
      useAnthropicApi: false,
      useResponsesApi: false,
    });
  });

  it("keeps provider-level @ai-sdk/openai without an override on chat", async () => {
    const { getCustomModelRouting } = await importRouting(
      { apiShape: undefined, npmOverride: undefined },
      "@ai-sdk/openai"
    );
    await expect(
      getCustomModelRouting({ ...ZEN_PROVIDER }, "plain-model")
    ).resolves.toEqual({
      providerOptionsKey: "opencode-go",
      sendReasoningEffort: false,
      useAnthropicApi: false,
      useResponsesApi: false,
    });
  });

  it("falls back for non-openai providers without touching the catalog", async () => {
    const { getCustomModelRouting } = await importRouting(
      { apiShape: "responses", npmOverride: "@ai-sdk/openai" },
      undefined
    );
    const provider = {
      name: "Claude",
      providerKey: "anthropic",
      type: "anthropic",
    } as const;
    await expect(
      getCustomModelRouting(provider, "claude-model")
    ).resolves.toEqual({
      providerOptionsKey: "anthropic",
      sendReasoningEffort: false,
      useAnthropicApi: false,
      useResponsesApi: false,
    });
  });

  it("falls back when the catalog lookup fails", async () => {
    vi.doMock("./catalog", () => ({
      getCatalogProvider: vi.fn().mockReturnValue(undefined),
      getLiveCatalogModel: vi.fn().mockRejectedValue(new Error("offline")),
    }));
    vi.doMock("@/lib/db/queries", () => ({
      getCustomProviderById: vi.fn(),
    }));
    const { getCustomModelRouting } = await import("./providers");
    await expect(
      getCustomModelRouting({ ...ZEN_PROVIDER }, "any-model")
    ).resolves.toEqual({
      providerOptionsKey: "opencode-go",
      sendReasoningEffort: true,
      useAnthropicApi: false,
      useResponsesApi: false,
    });
  });
});

describe("buildReasoningCallOptions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function importHelper() {
    mockCatalog(undefined);
    return await import("./providers");
  }

  const responsesRoute = {
    providerOptionsKey: "openai",
    sendReasoningEffort: true,
    useAnthropicApi: false,
    useResponsesApi: true,
  } as const;

  const anthropicRoute = {
    maxOutputTokens: 131_072,
    providerOptionsKey: "anthropic",
    sendReasoningEffort: true,
    useAnthropicApi: true,
    useResponsesApi: false,
  } as const;

  const chatRoute = {
    providerOptionsKey: "opencode-go",
    sendReasoningEffort: true,
    useAnthropicApi: false,
    useResponsesApi: false,
  } as const;

  it("returns no options for non-reasoning models", async () => {
    const { buildReasoningCallOptions } = await importHelper();
    expect(
      buildReasoningCallOptions(responsesRoute, {
        effort: "high",
        isReasoningModel: false,
      })
    ).toEqual({});
  });

  it("always requests Responses summaries, even at the default effort", async () => {
    const { buildReasoningCallOptions } = await importHelper();
    expect(
      buildReasoningCallOptions(responsesRoute, {
        effort: "default",
        isReasoningModel: true,
      })
    ).toEqual({
      providerOptions: {
        openai: { forceReasoning: true, reasoningSummary: "auto" },
      },
      reasoning: undefined,
    });
    expect(
      buildReasoningCallOptions(responsesRoute, {
        effort: undefined,
        isReasoningModel: true,
      })
    ).toEqual({
      providerOptions: {
        openai: { forceReasoning: true, reasoningSummary: "auto" },
      },
      reasoning: undefined,
    });
  });

  it("forces reasoning-model handling for third-party Responses models", async () => {
    const { buildReasoningCallOptions } = await importHelper();
    // Without forceReasoning the OpenAI SDK drops effort/summary for ids it
    // does not recognize (Muse Spark, Grok) and no summaries come back.
    expect(
      buildReasoningCallOptions(responsesRoute, {
        effort: "high",
        isReasoningModel: true,
      })
    ).toEqual({
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "high",
          reasoningSummary: "auto",
        },
      },
      reasoning: "high",
    });
  });

  it("omits the summary when Responses reasoning is disabled", async () => {
    const { buildReasoningCallOptions } = await importHelper();
    expect(
      buildReasoningCallOptions(responsesRoute, {
        effort: "none",
        isReasoningModel: true,
      })
    ).toEqual({
      providerOptions: {
        openai: { forceReasoning: true, reasoningEffort: "none" },
      },
      reasoning: "none",
    });
  });

  it("forwards Responses max effort literally", async () => {
    const { buildReasoningCallOptions } = await importHelper();
    // Luna-class models list "max" in the live catalog; the Responses
    // `reasoningEffort` field is free-string so the SDK passes it through.
    expect(
      buildReasoningCallOptions(responsesRoute, {
        effort: "max",
        isReasoningModel: true,
      })
    ).toEqual({
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "max",
          reasoningSummary: "auto",
        },
      },
      reasoning: undefined,
    });
  });

  it("drops unrecognized effort values", async () => {
    const { buildReasoningCallOptions } = await importHelper();
    // Title generation reads effort straight from cookies, bypassing the
    // chat route's schema validation.
    expect(
      buildReasoningCallOptions(responsesRoute, {
        effort: "turbo",
        isReasoningModel: true,
      })
    ).toEqual({
      providerOptions: {
        openai: { forceReasoning: true, reasoningSummary: "auto" },
      },
      reasoning: undefined,
    });
    expect(
      buildReasoningCallOptions(chatRoute, {
        effort: "turbo",
        isReasoningModel: true,
      })
    ).toEqual({});
  });

  it("maps efforts to the Anthropic Messages API", async () => {
    const { buildReasoningCallOptions } = await importHelper();
    expect(
      buildReasoningCallOptions(anthropicRoute, {
        effort: "high",
        isReasoningModel: true,
      })
    ).toEqual({
      maxOutputTokens: 131_072,
      providerOptions: { anthropic: { effort: "high" } },
      reasoning: undefined,
    });
    expect(
      buildReasoningCallOptions(anthropicRoute, {
        effort: "none",
        isReasoningModel: true,
      })
    ).toEqual({
      maxOutputTokens: 131_072,
      providerOptions: { anthropic: { thinking: { type: "disabled" } } },
      reasoning: undefined,
    });
    // No effort: server default applies, but the token cap is still needed.
    expect(
      buildReasoningCallOptions(anthropicRoute, {
        effort: "default",
        isReasoningModel: true,
      })
    ).toEqual({ maxOutputTokens: 131_072 });
  });

  it("passes chat-completion efforts through under the provider key", async () => {
    const { buildReasoningCallOptions } = await importHelper();
    expect(
      buildReasoningCallOptions(chatRoute, {
        effort: "high",
        isReasoningModel: true,
      })
    ).toEqual({
      providerOptions: { "opencode-go": { reasoningEffort: "high" } },
      reasoning: "high",
    });
    expect(
      buildReasoningCallOptions(chatRoute, {
        effort: "max",
        isReasoningModel: true,
      })
    ).toEqual({
      providerOptions: { "opencode-go": { reasoningEffort: "max" } },
      reasoning: undefined,
    });
    expect(
      buildReasoningCallOptions(chatRoute, {
        effort: "default",
        isReasoningModel: true,
      })
    ).toEqual({});
  });

  it("keeps unified reasoning when provider options are disabled", async () => {
    const { buildReasoningCallOptions } = await importHelper();
    // Provider-level `@ai-sdk/openai` setups resolve effort from the unified
    // option, so it must survive `sendReasoningEffort: false`.
    const openaiChatRoute = {
      ...chatRoute,
      providerOptionsKey: "openai",
      sendReasoningEffort: false,
    } as const;
    expect(
      buildReasoningCallOptions(openaiChatRoute, {
        effort: "high",
        isReasoningModel: true,
      })
    ).toEqual({ reasoning: "high" });
  });

  it("omits the token cap when the catalog has no limit", async () => {
    const { buildReasoningCallOptions } = await importHelper();
    const noLimitRoute = {
      ...anthropicRoute,
      maxOutputTokens: undefined,
    } as const;
    const noEffort = buildReasoningCallOptions(noLimitRoute, {
      effort: "default",
      isReasoningModel: true,
    });
    expect(noEffort).toEqual({});
    expect("maxOutputTokens" in noEffort).toBe(false);
    expect(
      buildReasoningCallOptions(noLimitRoute, {
        effort: "high",
        isReasoningModel: true,
      })
    ).toEqual({
      providerOptions: { anthropic: { effort: "high" } },
    });
  });
});

describe("getLanguageModel construction", () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Bypass the mock provider so custom providers resolve for real.
    for (const key of [
      "CLERK_SECRET_KEY",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "POSTGRES_URL",
    ]) {
      envBackup[key] = process.env[key];
    }
    process.env["CLERK_SECRET_KEY"] = "test-secret";
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "test-publishable";
    process.env["POSTGRES_URL"] = "postgres://test";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  async function importWithProvider(catalogModel: unknown) {
    mockCatalog(catalogModel, "@ai-sdk/openai-compatible");
    vi.doMock("@/lib/db/queries", () => ({
      getCustomProviderById: vi.fn().mockResolvedValue({
        baseURL: ZEN_PROVIDER.baseURL,
        encryptedApiKey: "encrypted",
        iv: "iv",
        name: ZEN_PROVIDER.name,
        providerKey: ZEN_PROVIDER.providerKey,
        salt: null,
        type: ZEN_PROVIDER.type,
      }),
    }));
    vi.doMock("./encryption", () => ({
      decrypt: vi.fn().mockReturnValue("test-key"),
    }));
    return await import("./providers");
  }

  it("builds Responses API models for per-model openai overrides", async () => {
    const { getLanguageModel } = await importWithProvider({
      apiShape: undefined,
      npmOverride: "@ai-sdk/openai",
    });
    const model = await getLanguageModel(
      "custom-p1/muse-spark-1.3-contributor"
    );
    expect(model?.modelId).toBe("muse-spark-1.3-contributor");
    expect(model?.provider).toBe("openai.responses");
  });

  it("builds Messages API models for per-model anthropic overrides", async () => {
    const { getLanguageModel } = await importWithProvider({
      apiShape: undefined,
      npmOverride: "@ai-sdk/anthropic",
      outputLimit: 131_072,
    });
    const model = await getLanguageModel("custom-p1/minimax-m3");
    expect(model?.modelId).toBe("minimax-m3");
    expect(model?.provider).toBe("anthropic.messages");
  });

  it("builds chat-completion models without an override", async () => {
    const { getLanguageModel } = await importWithProvider(undefined);
    const model = await getLanguageModel("custom-p1/kimi-k2.7-code");
    expect(model?.modelId).toBe("kimi-k2.7-code");
    expect(model?.provider).toBe("opencode-go.chat");
  });
});
