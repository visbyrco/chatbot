import type { Model, Provider, ProviderMap } from "@opencode-ai/models";
import { Models } from "@opencode-ai/models";
import { generatedAt, providers } from "@opencode-ai/models/snapshot";
import { isTestEnvironmentNow } from "../constants";
import type { ModelPricing } from "../db/schema";

export type CatalogProvider = {
  key: string;
  name: string;
  baseURL: string;
  type: "openai" | "anthropic";
  modelCount: number;
  npm: string;
};

export type CatalogModel = {
  modelId: string;
  name: string;
  capabilities: {
    tools: boolean;
    vision: boolean;
    reasoning: boolean;
    reasoningEfforts?: string[];
  };
  pricing?: ModelPricing;
};

const LIVE_CATALOG_TTL_MS = 5 * 60 * 1000;
const PERSISTED_SYNC_TTL_MS = 60 * 60 * 1000;
const LIVE_FETCH_TIMEOUT_MS = 5000;

let liveCache: { fetchedAt: number; providers: ProviderMap | null } | null =
  null;
let liveInFlight: Promise<ProviderMap | null> | null = null;

function getLiveProviders(force = false): Promise<ProviderMap | null> {
  if (isTestEnvironmentNow()) {
    return Promise.resolve(null);
  }

  const cached = liveCache;
  if (!force && cached && Date.now() - cached.fetchedAt < LIVE_CATALOG_TTL_MS) {
    return Promise.resolve(cached.providers);
  }

  if (liveInFlight && !force) {
    return liveInFlight;
  }

  let fetchPromise!: Promise<ProviderMap | null>;
  fetchPromise = (async () => {
    try {
      const client = Models.make();
      const liveProviders = (await client.providers({
        signal: AbortSignal.timeout(LIVE_FETCH_TIMEOUT_MS),
      })) as ProviderMap;
      liveCache = { fetchedAt: Date.now(), providers: liveProviders };
      return liveProviders;
    } catch (error) {
      console.error(
        "[catalog] Failed to fetch live catalog from models.dev:",
        error
      );
      if (cached) {
        return cached.providers;
      }
      liveCache = { fetchedAt: Date.now(), providers: null };
      return null;
    } finally {
      if (liveInFlight === fetchPromise) {
        liveInFlight = null;
      }
    }
  })();

  liveInFlight = fetchPromise;
  return fetchPromise;
}

function providerToCatalogProvider(p: Provider): CatalogProvider {
  return {
    baseURL: p.api ?? getDefaultBaseURL(p),
    key: p.id,
    modelCount: Object.keys(p.models).length,
    name: p.name,
    npm: p.npm,
    type: resolveProviderType(p),
  };
}

function providerToCatalogModels(p: Provider): CatalogModel[] {
  return Object.values(p.models)
    .filter((m) => m.status !== "deprecated")
    .map((m) => ({
      capabilities: mapModelCapabilities(m),
      modelId: m.id,
      name: m.name,
      pricing: m.cost
        ? {
            cachedInput: m.cost.cache_read ?? null,
            cachedOutput: m.cost.cache_write ?? null,
            input: m.cost.input ?? null,
            output: m.cost.output ?? null,
          }
        : undefined,
    }));
}

export function getCatalogProvider(key: string): Provider | undefined {
  return providers[key];
}

export function getCatalogModelsForProvider(key: string): CatalogModel[] {
  const provider = providers[key];
  if (!provider) {
    return [];
  }

  return providerToCatalogModels(provider);
}

export async function getLiveCatalogProviders(
  force = false
): Promise<{ generatedAt: string; providers: CatalogProvider[] }> {
  const live = await getLiveProviders(force);
  const source = live ?? providers;
  return {
    generatedAt: live ? new Date().toISOString() : generatedAt,
    providers: Object.values(source).map(providerToCatalogProvider),
  };
}

export async function getLiveCatalogModelsForProvider(
  key: string,
  force = false
): Promise<CatalogModel[]> {
  const live = await getLiveProviders(force);
  const provider = live?.[key] ?? providers[key];
  if (!provider) {
    return [];
  }

  return providerToCatalogModels(provider);
}

export async function getLiveCatalogModel(
  providerKey: string,
  modelId: string
): Promise<CatalogModel | undefined> {
  return (await getLiveCatalogModelsForProvider(providerKey)).find(
    (entry) => entry.modelId === modelId
  );
}

export async function syncCatalogPricingForUser(userId: string) {
  const {
    getCatalogSync,
    getCustomModelsByProviderIds,
    getCustomProvidersByUserId,
    updateCatalogSync,
    updateCustomModel,
  } = await import("../db/queries");
  const lastSync = await getCatalogSync();
  const isStale =
    !lastSync?.syncedAt ||
    Date.now() - lastSync.syncedAt.getTime() >= PERSISTED_SYNC_TTL_MS;
  const live = await getLiveProviders(isStale);
  if (!live) {
    return;
  }

  const configuredProviders = await getCustomProvidersByUserId({ userId });
  const relevantProviders = configuredProviders.filter(
    (p) => p.providerKey && live[p.providerKey]
  );
  if (relevantProviders.length === 0) {
    if (isStale) {
      await updateCatalogSync({ syncedAt: new Date() });
    }
    return;
  }
  const providerIds = relevantProviders.map((p) => p.id);
  const allModels = await getCustomModelsByProviderIds({ providerIds });
  const modelsByProvider = new Map<string, typeof allModels>();
  for (const m of allModels) {
    const arr = modelsByProvider.get(m.providerId);
    if (arr) {
      arr.push(m);
    } else {
      modelsByProvider.set(m.providerId, [m]);
    }
  }
  await Promise.all(
    relevantProviders.flatMap((configuredProvider) => {
      const providerKey = configuredProvider.providerKey as string;
      const liveProvider = live[providerKey];
      if (!liveProvider) {
        return [];
      }
      const catalogModels = new Map(
        providerToCatalogModels(liveProvider).map((model) => [
          model.modelId,
          model,
        ])
      );
      const models = modelsByProvider.get(configuredProvider.id) ?? [];
      return models
        .filter((model) => !model.pricingIsCustom)
        .flatMap((model) => {
          const catalogModel = catalogModels.get(model.modelId);
          if (!catalogModel) {
            return [];
          }
          return updateCustomModel({
            id: model.id,
            pricing: catalogModel.pricing ?? null,
            pricingIsCustom: false,
            providerId: configuredProvider.id,
          });
        });
    })
  );
  if (isStale) {
    await updateCatalogSync({ syncedAt: new Date() });
  }
}

export function mapModelCapabilities(model: Model): {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
  reasoningEfforts?: string[];
} {
  const result: {
    tools: boolean;
    vision: boolean;
    reasoning: boolean;
    reasoningEfforts?: string[];
  } = {
    reasoning: model.reasoning === true,
    tools: model.tool_call === true,
    vision:
      model.attachment === true ||
      model.modalities?.input?.includes("image") === true,
  };

  if (model.reasoning && model.reasoning_options) {
    const effortOption = model.reasoning_options.find(
      (opt) => opt.type === "effort"
    );
    if (effortOption && effortOption.type === "effort") {
      result.reasoningEfforts = effortOption.values.map((v) =>
        v === null ? "none" : v
      );
    }
  }

  return result;
}

function resolveProviderType(provider: Provider): "openai" | "anthropic" {
  if (provider.npm?.includes("anthropic")) {
    return "anthropic";
  }
  return "openai";
}

function getDefaultBaseURL(provider: Provider): string {
  if (provider.npm?.includes("anthropic")) {
    return "https://api.anthropic.com/v1";
  }
  if (provider.npm?.includes("openai")) {
    return "https://api.openai.com/v1";
  }
  if (provider.npm?.includes("google")) {
    return "https://generativelanguage.googleapis.com";
  }
  return "";
}
