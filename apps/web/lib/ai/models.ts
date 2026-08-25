export type ReasoningEffort =
  | "default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
  reasoningEfforts?: string[];
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  providerKey?: string | null;
  description: string;
  reasoningEffort?: ReasoningEffort;
};

export async function isAllowedModelId(modelId: string): Promise<boolean> {
  if (modelId.startsWith("custom-")) {
    const { getCustomModelsByProviderId } = await import("../db/queries");
    const [providerPart] = modelId.split("/");
    const providerId = providerPart.slice(7);
    const models = await getCustomModelsByProviderId({ providerId });
    const modelName = modelId.split("/").slice(1).join("/");
    const isAllowed = models.some((m) => m.modelId === modelName);
    if (!isAllowed) {
      console.error("isAllowedModelId: model not found", {
        availableModels: models.map((m) => m.modelId),
        modelId,
        modelName,
        providerId,
      });
    }
    return isAllowed;
  }

  return false;
}

export async function getCustomModelsForUser(
  userId: string
): Promise<ChatModel[]> {
  const { getCustomModelsByProviderIds, getCustomProvidersByUserId } =
    await import("../db/queries");
  const providers = await getCustomProvidersByUserId({ userId });
  if (providers.length === 0) {
    return [];
  }
  const providerIds = providers.map((p) => p.id);
  const models = await getCustomModelsByProviderIds({ providerIds });
  const providerById = new Map(providers.map((p) => [p.id, p]));
  return models.map((model) => {
    const provider = providerById.get(model.providerId);
    if (!provider) {
      return {
        description: "",
        id: `custom-${model.providerId}/${model.modelId}`,
        name: model.name,
        provider: `custom-${model.providerId}`,
        providerKey: null,
      };
    }
    return {
      description: `${provider.name} (${provider.type})`,
      id: `custom-${provider.id}/${model.modelId}`,
      name: model.name,
      provider: `custom-${provider.id}`,
      providerKey: provider.providerKey,
    };
  });
}

export async function getCustomCapabilitiesForUser(
  userId: string
): Promise<Record<string, ModelCapabilities>> {
  const { getCatalogModelsForProvider } = await import("./catalog");
  const { getCustomModelsByProviderIds, getCustomProvidersByUserId } =
    await import("../db/queries");
  const providers = await getCustomProvidersByUserId({ userId });
  if (providers.length === 0) {
    return {};
  }
  const providerIds = providers.map((p) => p.id);
  const models = await getCustomModelsByProviderIds({ providerIds });
  const modelsByProvider = new Map<string, typeof models>();
  for (const model of models) {
    const arr = modelsByProvider.get(model.providerId);
    if (arr) {
      arr.push(model);
    } else {
      modelsByProvider.set(model.providerId, [model]);
    }
  }
  const allEntries = providers.flatMap((provider) => {
    const catalogCapabilities = provider.providerKey
      ? new Map(
          getCatalogModelsForProvider(provider.providerKey).map((m) => [
            m.modelId,
            m.capabilities,
          ])
        )
      : null;

    const providerModels = modelsByProvider.get(provider.id) ?? [];
    return providerModels.map((model) => {
      const capabilities = model.capabilities as ModelCapabilities;
      const catalogEntry = catalogCapabilities?.get(model.modelId);
      if (catalogEntry?.reasoningEfforts && !capabilities.reasoningEfforts) {
        return {
          key: `custom-${provider.id}/${model.modelId}`,
          value: {
            ...capabilities,
            reasoningEfforts: catalogEntry.reasoningEfforts,
          },
        };
      }
      return {
        key: `custom-${provider.id}/${model.modelId}`,
        value: capabilities,
      };
    });
  });

  return Object.fromEntries(allEntries.map(({ key, value }) => [key, value]));
}

export async function getProviderNamesForUser(
  userId: string
): Promise<Record<string, string>> {
  const { getCustomProvidersByUserId } = await import("../db/queries");
  const { getCatalogProvider } = await import("./catalog");
  const providers = await getCustomProvidersByUserId({ userId });

  const names: Record<string, string> = {};
  for (const provider of providers) {
    const key = `custom-${provider.id}`;
    if (provider.providerKey) {
      const catalogProvider = getCatalogProvider(provider.providerKey);
      names[key] = catalogProvider?.name ?? provider.name;
    } else {
      names[key] = provider.name;
    }
  }

  return names;
}
