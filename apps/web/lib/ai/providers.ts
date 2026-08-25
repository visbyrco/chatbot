import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { customProvider as aiCustomProvider } from "ai";
import type { CustomProvider } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { isTestEnvironmentNow } from "../constants";
import { getCustomProviderById } from "../db/queries";
import { getCatalogProvider } from "./catalog";
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

function createModelFromProvider(
  provider: Pick<CustomProvider, "type" | "baseURL" | "providerKey" | "name">,
  apiKey: string,
  modelName: string
): LanguageModelV4 {
  if (provider.type === "openai") {
    const sdk = getCustomProviderSdk(provider);

    if (sdk === "openai") {
      // Use the chat completions API for custom OpenAI-compatible providers.
      // The default "languageModel" uses the Responses API, which most custom
      // endpoints (OpenRouter, local proxies, etc.) do not support.
      return createOpenAI({
        apiKey,
        baseURL: provider.baseURL,
      }).chat(modelName);
    }

    return createOpenAICompatible({
      apiKey,
      baseURL: provider.baseURL,
      name: getCustomProviderOptionsKey(provider),
    })(modelName);
  }

  if (provider.type === "anthropic") {
    return createAnthropic({
      apiKey,
      baseURL: provider.baseURL,
    }).languageModel(modelName);
  }

  throw new Error(`Unknown custom provider type: ${provider.type}`);
}

async function resolveCustomProvider(providerId: string, modelName: string) {
  const cached = providerCache.get(providerId);
  if (cached) {
    return createModelFromProvider(
      {
        baseURL: cached.baseURL,
        name: cached.name,
        providerKey: cached.providerKey,
        type: cached.type,
      },
      cached.apiKey,
      modelName
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

  const model = createModelFromProvider(provider, apiKey, modelName);
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

function resolveModel(modelId: string) {
  const [providerName, ...rest] = modelId.split("/");
  const modelName = rest.join("/");

  if (providerName.startsWith("custom-")) {
    const providerId = providerName.slice(7);
    return resolveCustomProvider(providerId, modelName);
  }

  throw new Error(`Unknown provider: ${providerName}`);
}

export function getLanguageModel(modelId: string) {
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

  return resolveModel(modelId);
}

export function invalidateProviderCache(providerId: string) {
  providerCache.delete(providerId);
}
