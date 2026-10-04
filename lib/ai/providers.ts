import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type {
  JSONValue,
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from "@ai-sdk/provider";
import { customProvider as aiCustomProvider } from "ai";
import type { CustomProvider } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { isTestEnvironmentNow } from "../constants";
import { getCustomProviderById } from "../db/queries";
import { getCatalogProvider, getLiveCatalogModel } from "./catalog";
import { decrypt } from "./encryption";

function isClerkConfigured(): boolean {
  return (
    Boolean(process.env["CLERK_SECRET_KEY"]) &&
    Boolean(process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"])
  );
}

function getMockProvider() {
  if (
    !isTestEnvironmentNow() &&
    isClerkConfigured() &&
    process.env["POSTGRES_URL"] &&
    process.env["VERCEL_ENV"] !== "preview"
  ) {
    return null;
  }
  const { chatModel, titleModel: mockTitleModel } = require("./models.mock");
  return aiCustomProvider({
    languageModels: {
      "chat-model": chatModel,
      "title-model": mockTitleModel,
    },
  });
}

// Lazily evaluated so `DEMO_MODE=1` at `docker run` time is honored even when
// the Hub image was built without it. The previous static `isTestEnvironment`
// value was frozen at build time.
export const myProvider: ReturnType<typeof getMockProvider> = new Proxy(
  {} as NonNullable<ReturnType<typeof getMockProvider>>,
  {
    get(_t, prop) {
      const p = getMockProvider();
      if (!p) {
        return;
      }
      return (p as unknown as Record<string | symbol, unknown>)[prop];
    },
  }
) as unknown as ReturnType<typeof getMockProvider>;

function getActiveMockProvider() {
  // Fall back to mock when Clerk isn't configured, when no DB, or in Vercel
  // preview — so PR preview without POSTGRES_URL stays usable.
  if (
    isTestEnvironmentNow() ||
    !isClerkConfigured() ||
    !process.env["POSTGRES_URL"] ||
    process.env["VERCEL_ENV"] === "preview"
  ) {
    return getMockProvider();
  }
  return null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;

type CachedProvider = {
  apiKey: string;
  baseURL: string;
  expiresAt: number;
  type: "openai" | "anthropic";
  providerKey: string | null;
  name: string;
};

function zeroizeCached(entry: CachedProvider): void {
  // Note: JS strings are immutable – Buffer.from copies the string, so
  // filling the buffer does not zero the original string allocation.
  // The real mitigation is overwriting the reference; the buffer fill
  // is best-effort for any copied bytes that remain in the heap.
  try {
    const buf = Buffer.from(entry.apiKey, "utf8");
    buf.fill(0);
  } catch {
    // ignore
  }
  entry.apiKey = "";
}

class LRUCache<K, V extends { expiresAt: number }> {
  private readonly max: number;
  private readonly ttl: number;
  private readonly map: Map<K, V>;
  private readonly dispose?: (value: V, key: K) => void;

  constructor(opts: {
    max: number;
    ttl: number;
    dispose?: (value: V, key: K) => void;
  }) {
    this.max = opts.max;
    this.ttl = opts.ttl;
    this.map = new Map();
    this.dispose = opts.dispose;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      return;
    }
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      this.dispose?.(entry, key);
      return;
    }
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      const old = this.map.get(key);
      if (old) {
        this.dispose?.(old, key);
      }
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      const firstKey = this.map.keys().next().value as K;
      const firstVal = this.map.get(firstKey);
      if (firstVal) {
        this.dispose?.(firstVal, firstKey);
      }
      this.map.delete(firstKey);
    }
    this.map.set(key, value);
    // TTL is enforced lazily on get(); no per-entry timer to avoid leaks
    // when keys are hot-updated before expiry.
  }

  delete(key: K): boolean {
    const val = this.map.get(key);
    if (val) {
      this.dispose?.(val, key);
    }
    return this.map.delete(key);
  }
}

// LRU max 500 ttl 5m and zeroize on eviction/expiry
const providerCache = new LRUCache<string, CachedProvider>({
  dispose: (value) => zeroizeCached(value),
  max: CACHE_MAX,
  ttl: CACHE_TTL_MS,
});

export function getCustomProviderOptionsKey(
  provider: Pick<CustomProvider, "providerKey" | "name">
): string {
  return (
    provider.providerKey ??
    provider.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

export const OPENCODE_GO_SESSION_HEADER = "x-opencode-session";

// OpenCode Go routes by stable per-conversation session id and requires
// callers to identify with their own User-Agent.
// See https://opencode.ai/docs/go/#where-can-i-use-it
const VISBYR_USER_AGENT = "visbyr-chat/3.1.0";

export function isOpenCodeGoBaseURL(baseURL: string): boolean {
  return /opencode\.ai\/zen\/go/i.test(baseURL);
}

export function getOpenCodeGoHeaders(
  sessionId?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": VISBYR_USER_AGENT,
  };
  const session = sessionId?.trim();
  if (session) {
    headers[OPENCODE_GO_SESSION_HEADER] = session;
  }
  return headers;
}

function getCustomProviderSdk(
  provider: Pick<CustomProvider, "type" | "providerKey">
): "openai" | "openai-compatible" {
  if (provider.type !== "openai") {
    throw new Error(`Unexpected provider type: ${provider.type}`);
  }

  if (provider.providerKey) {
    const catalogProvider = getCatalogProvider(provider.providerKey);
    if (catalogProvider?.npm === "@ai-sdk/openai") {
      return "openai";
    }
  }

  return "openai-compatible";
}

export function isOpenAICompatibleProvider(
  provider: Pick<CustomProvider, "type" | "providerKey">
): boolean {
  return (
    provider.type === "openai" &&
    getCustomProviderSdk(provider) === "openai-compatible"
  );
}

export type CustomModelRouting = {
  /** True when the model only works through the Responses API. */
  useResponsesApi: boolean;
  /** True when the model only works through the Anthropic Messages API. */
  useAnthropicApi: boolean;
  /**
   * providerOptions namespace for reasoning effort: `"openai"` for
   * Responses API models, `"anthropic"` for Messages API models,
   * otherwise the provider-specific key.
   */
  providerOptionsKey: string;
  /** Whether to forward reasoning effort via provider options. */
  sendReasoningEffort: boolean;
  /**
   * Explicit max output tokens for SDKs that cap unknown models
   * (the Anthropic SDK limits unrecognized ids to 4096 tokens).
   */
  maxOutputTokens?: number;
};

/**
 * Efforts the Anthropic SDK accepts (`effort` field). Anything else must
 * be mapped (e.g. `"minimal"` has no Anthropic equivalent) or dropped so
 * the model's server-side default applies.
 */
const ANTHROPIC_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

function isOpenAiSdkNpm(npm: string | undefined): boolean {
  return npm === "@ai-sdk/openai";
}

function isAnthropicSdkNpm(npm: string | undefined): boolean {
  return npm === "@ai-sdk/anthropic";
}

/**
 * Resolve how a specific model must be driven, honoring per-model
 * overrides from the models.dev catalog (`model.provider.npm/shape`).
 *
 * OpenCode Go serves each model on exactly one endpoint (see
 * https://opencode.ai/docs/go/#endpoints): Responses-only models
 * (e.g. Muse Spark) reject `/chat/completions` with
 * `ModelProtocolUnsupported` and must go through the Responses API
 * (`@ai-sdk/openai` default, `…/v1/responses`), while Anthropic-native
 * models (e.g. MiniMax, Qwen) must go through the Messages API
 * (`@ai-sdk/anthropic`, `…/v1/messages`). The catalog's per-model `npm`
 * override encodes which SDK — and therefore which endpoint — each model
 * needs. Falls back to provider-level routing when the catalog has no
 * override (or is unreachable), so unknown models keep working as before.
 */
export async function getCustomModelRouting(
  provider: Pick<CustomProvider, "type" | "providerKey" | "name">,
  modelName: string
): Promise<CustomModelRouting> {
  const fallback: CustomModelRouting = {
    providerOptionsKey: getCustomProviderOptionsKey(provider),
    sendReasoningEffort: isOpenAICompatibleProvider(provider),
    useAnthropicApi: false,
    useResponsesApi: false,
  };
  if (provider.type !== "openai" || !provider.providerKey) {
    return fallback;
  }
  let catalogModel: Awaited<ReturnType<typeof getLiveCatalogModel>>;
  try {
    catalogModel = await getLiveCatalogModel(provider.providerKey, modelName);
  } catch {
    return fallback;
  }
  if (!catalogModel) {
    return fallback;
  }
  if (catalogModel.apiShape === "responses") {
    return {
      providerOptionsKey: "openai",
      sendReasoningEffort: true,
      useAnthropicApi: false,
      useResponsesApi: true,
    };
  }
  if (catalogModel.apiShape === "completions") {
    return fallback;
  }
  if (isAnthropicSdkNpm(catalogModel.npmOverride)) {
    return {
      maxOutputTokens: catalogModel.outputLimit,
      providerOptionsKey: "anthropic",
      sendReasoningEffort: true,
      useAnthropicApi: true,
      useResponsesApi: false,
    };
  }
  if (
    isOpenAiSdkNpm(catalogModel.npmOverride) &&
    getCustomProviderSdk(provider) !== "openai"
  ) {
    return {
      providerOptionsKey: "openai",
      sendReasoningEffort: true,
      useAnthropicApi: false,
      useResponsesApi: true,
    };
  }
  return fallback;
}

export type ReasoningCallOptions = {
  /** Value for the unified `reasoning` option, if any. */
  reasoning?: LanguageModelV4CallOptions["reasoning"];
  /** Provider options carrying effort/summary flags, if any. */
  providerOptions?: Record<string, Record<string, JSONValue>>;
  /** Explicit max output tokens, if the route requires it. */
  maxOutputTokens?: number;
};

/** Values the unified `reasoning` call option accepts. */
const UNIFIED_REASONING_VALUES: ReadonlySet<string> = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

/**
 * Effort values callers may pass. The chat route validates these via schema,
 * but title generation reads them straight from cookies, so unknown strings
 * are treated as unset (server default) rather than forwarded to providers.
 */
const KNOWN_EFFORTS: ReadonlySet<string> = new Set([
  ...UNIFIED_REASONING_VALUES,
  "max",
]);

/**
 * Build the reasoning-related call options for `streamText`/`generateText`
 * from a resolved route. Centralizes the per-SDK mapping so chat streaming
 * and title generation stay consistent:
 *
 * - Responses API (`openai` key): the SDK only recognizes reasoning models
 *   by id (`o*`/`gpt-5+`), so third-party models (Muse Spark, Grok) need
 *   `forceReasoning` or their effort/summary flags are silently dropped and
 *   no reasoning summaries come back. Summaries are always requested (even
 *   at the default effort) so reasoning output isn't lost.
 * - Messages API (`anthropic` key): effort maps to `effort`, `"none"`
 *   disables thinking, and the unified `reasoning` option is left unset —
 *   the SDK would otherwise derive a thinking budget from its 4096-token
 *   fallback for unrecognized ids. `maxOutputTokens` comes from the catalog
 *   for the same reason.
 * - Chat completions: `reasoningEffort` passes through under the
 *   provider-specific key.
 */
export function buildReasoningCallOptions(
  routing: CustomModelRouting,
  opts: { isReasoningModel: boolean; effort?: string }
): ReasoningCallOptions {
  if (!opts.isReasoningModel) {
    return {};
  }
  const rawEffort =
    opts.effort && opts.effort !== "default" ? opts.effort : undefined;
  // Drop unrecognized values (e.g. tampered cookies): the Responses
  // `reasoningEffort` field is free-string, so the SDK would forward
  // garbage to the endpoint. "max"/"none" are kept — the SDK accepts both
  // and Luna-class models list them in the live catalog.
  const effort =
    rawEffort && KNOWN_EFFORTS.has(rawEffort) ? rawEffort : undefined;
  // The unified option rejects provider-specific values like "max".
  const unifiedReasoning =
    effort && effort !== "max" && UNIFIED_REASONING_VALUES.has(effort)
      ? (effort as LanguageModelV4CallOptions["reasoning"])
      : undefined;

  if (routing.useResponsesApi) {
    return {
      providerOptions: {
        openai: {
          ...(effort ? { reasoningEffort: effort } : {}),
          // Always request summaries: without this the API returns no
          // reasoning text at the default effort. "none" disables reasoning
          // entirely, so no summary is requested then.
          ...(effort === "none" ? {} : { reasoningSummary: "auto" }),
          // Third-party Responses models (Muse Spark, Grok) are unknown to
          // the SDK's reasoning-model allowlist; without this flag the SDK
          // drops effort/summary and returns no reasoning output.
          forceReasoning: true,
        },
      },
      reasoning: unifiedReasoning,
    };
  }

  if (routing.useAnthropicApi) {
    // Omit the cap when the catalog has no limit: callers fall back to the
    // SDK default either way, and an explicit `undefined` key would only
    // obscure that.
    const cap = routing.maxOutputTokens
      ? { maxOutputTokens: routing.maxOutputTokens }
      : {};
    if (!effort) {
      return cap;
    }
    if (effort === "none") {
      return {
        ...cap,
        providerOptions: {
          anthropic: { thinking: { type: "disabled" } },
        },
      };
    }
    // The Anthropic SDK has no "minimal" level; closest equivalent.
    const mappedEffort = effort === "minimal" ? "low" : effort;
    if (!ANTHROPIC_EFFORTS.has(mappedEffort)) {
      return cap;
    }
    return {
      ...cap,
      providerOptions: {
        anthropic: { effort: mappedEffort },
      },
    };
  }

  if (!effort) {
    return {};
  }
  // The unified option is independent of the provider-options gate: e.g.
  // provider-level `@ai-sdk/openai` setups resolve effort from it.
  if (!routing.sendReasoningEffort) {
    return { reasoning: unifiedReasoning };
  }
  return {
    providerOptions: {
      [routing.providerOptionsKey]: { reasoningEffort: effort },
    },
    reasoning: unifiedReasoning,
  };
}

async function createModelFromProvider(
  provider: Pick<CustomProvider, "type" | "baseURL" | "providerKey" | "name">,
  apiKey: string,
  modelName: string,
  sessionId?: string
): Promise<LanguageModelV4> {
  const goHeaders = isOpenCodeGoBaseURL(provider.baseURL)
    ? getOpenCodeGoHeaders(sessionId)
    : undefined;

  if (provider.type === "openai") {
    const routing = await getCustomModelRouting(provider, modelName);

    if (routing.useAnthropicApi) {
      // Anthropic-native models (e.g. MiniMax, Qwen on OpenCode Zen) only
      // serve the Messages API (`…/v1/messages`); the SDK appends that path
      // to the shared base URL.
      return createAnthropic({
        apiKey,
        baseURL: provider.baseURL,
        ...(goHeaders ? { headers: goHeaders } : {}),
      }).languageModel(modelName);
    }

    if (routing.useResponsesApi) {
      // Responses-only models (e.g. Muse Spark on OpenCode Zen) reject
      // /chat/completions with ModelProtocolUnsupported. createOpenAI's
      // default languageModel uses the Responses API (/responses).
      return createOpenAI({
        apiKey,
        baseURL: provider.baseURL,
        ...(goHeaders ? { headers: goHeaders } : {}),
      }).languageModel(modelName);
    }

    const sdk = getCustomProviderSdk(provider);

    if (sdk === "openai") {
      // Use the chat completions API for custom OpenAI-compatible providers.
      // The default "languageModel" uses the Responses API, which most custom
      // endpoints (OpenRouter, local proxies, etc.) do not support.
      return createOpenAI({
        apiKey,
        baseURL: provider.baseURL,
        ...(goHeaders ? { headers: goHeaders } : {}),
      }).chat(modelName);
    }

    return createOpenAICompatible({
      apiKey,
      baseURL: provider.baseURL,
      ...(goHeaders ? { headers: goHeaders } : {}),
      name: getCustomProviderOptionsKey(provider),
    })(modelName);
  }

  if (provider.type === "anthropic") {
    return createAnthropic({
      apiKey,
      baseURL: provider.baseURL,
      ...(goHeaders ? { headers: goHeaders } : {}),
    }).languageModel(modelName);
  }

  throw new Error(`Unknown custom provider type: ${provider.type}`);
}

async function resolveCustomProvider(
  providerId: string,
  modelName: string,
  sessionId?: string
) {
  const cached = providerCache.get(providerId);
  if (cached) {
    return await createModelFromProvider(
      {
        baseURL: cached.baseURL,
        name: cached.name,
        providerKey: cached.providerKey,
        type: cached.type,
      },
      cached.apiKey,
      modelName,
      sessionId
    );
  }

  const provider = await getCustomProviderById({ id: providerId });
  if (!provider) {
    throw new Error(`Custom provider not found: ${providerId}`);
  }

  let apiKey: string;
  try {
    apiKey = decrypt(
      provider.encryptedApiKey,
      provider.iv,
      provider.salt ?? null
    );
  } catch (error) {
    throw new ChatbotError("bad_request:provider", { cause: error });
  }

  const model = await createModelFromProvider(
    provider,
    apiKey,
    modelName,
    sessionId
  );
  providerCache.set(providerId, {
    apiKey,
    baseURL: provider.baseURL,
    expiresAt: Date.now() + CACHE_TTL_MS,
    name: provider.name,
    providerKey: provider.providerKey,
    type: provider.type,
  });
  return model;
}

function resolveModel(modelId: string, sessionId?: string) {
  const [providerName, ...rest] = modelId.split("/");
  const modelName = rest.join("/");

  if (providerName.startsWith("custom-")) {
    const providerId = providerName.slice(7);
    return resolveCustomProvider(providerId, modelName, sessionId);
  }

  throw new Error(`Unknown provider: ${providerName}`);
}

export function getLanguageModel(
  modelId: string,
  opts?: { sessionId?: string }
) {
  const activeMock = getActiveMockProvider();
  if (activeMock) {
    // The mock provider registers models by bare id (e.g. "chat-model"),
    // but the client sends custom-provider ids ("custom-<uuid>/<modelId>").
    // Strip the provider prefix so the mock model can be resolved.
    const mockModelId = modelId.startsWith("custom-")
      ? modelId.split("/").slice(1).join("/")
      : modelId;
    return activeMock.languageModel(mockModelId);
  }

  return resolveModel(modelId, opts?.sessionId);
}

export function invalidateProviderCache(providerId: string) {
  providerCache.delete(providerId);
}
