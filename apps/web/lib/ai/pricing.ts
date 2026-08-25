import { getLiveCatalogModel } from "./catalog";

export type UsageForCost = {
  inputTokens?: number;
  cacheHitInputTokens?: number;
  cacheMissInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
};

export type ModelPricing = NonNullable<
  Awaited<ReturnType<typeof getLiveCatalogModel>>
>["pricing"];

export async function getModelPricing(modelId?: string) {
  if (!modelId) {
    return;
  }
  const [providerKey, ...modelParts] = modelId.split("/");
  if (!providerKey || modelParts.length === 0) {
    return;
  }
  if (providerKey.startsWith("custom-")) {
    const { getCustomModelsByProviderId } = await import("../db/queries");
    const models = await getCustomModelsByProviderId({
      providerId: providerKey.slice(7),
    });
    const model = models.find(
      (entry) => entry.modelId === modelParts.join("/")
    );
    if (!model || model.input === null || model.output === null) {
      return;
    }
    return {
      cachedInput: model.cachedInput,
      cachedOutput: model.cachedOutput,
      input: model.input,
      output: model.output,
    };
  }
  return (await getLiveCatalogModel(providerKey, modelParts.join("/")))
    ?.pricing;
}

export function calculateUsageCost(
  usage: UsageForCost,
  pricing?: ModelPricing
): number | null {
  if (!pricing) {
    return null;
  }
  if (pricing.input === null || pricing.output === null) {
    return null;
  }
  const input = Math.max(
    0,
    (usage.inputTokens ?? 0) -
      (usage.cacheHitInputTokens ?? 0) -
      (usage.cacheMissInputTokens ?? 0)
  );
  const cacheHit = usage.cacheHitInputTokens ?? 0;
  const cacheMiss = usage.cacheMissInputTokens ?? 0;
  const reasoning = usage.reasoningTokens ?? 0;
  const output = Math.max(0, (usage.outputTokens ?? 0) - reasoning);
  return (
    (input * pricing.input +
      cacheHit * (pricing.cachedInput ?? pricing.input) +
      cacheMiss * pricing.input +
      output * pricing.output +
      reasoning * pricing.output) /
    1_000_000
  );
}
