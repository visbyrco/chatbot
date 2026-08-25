import { after } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getLiveCatalogModelsForProvider } from "@/lib/ai/catalog";
import type { ModelCapabilities } from "@/lib/ai/models.client";
import {
  createCustomModels,
  getCustomModelsByProviderId,
  getCustomProviderById,
  updateCustomModel,
  updateCustomProvider,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

function capabilitiesEqual(
  a: ModelCapabilities,
  b: ModelCapabilities
): boolean {
  return (
    a.reasoning === b.reasoning && a.tools === b.tools && a.vision === b.vision
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:provider").toResponse();
  }

  const { id } = await params;
  const provider = await getCustomProviderById({ id });

  if (!provider || provider.userId !== session.user.id) {
    return new ChatbotError("not_found:provider").toResponse();
  }

  if (!provider.providerKey) {
    return Response.json(
      { error: "Provider is not linked to a catalog entry." },
      { status: 400 }
    );
  }

  const catalogModels = await getLiveCatalogModelsForProvider(
    provider.providerKey,
    true
  );
  if (catalogModels.length === 0) {
    return Response.json(
      { error: "No models found in catalog for this provider." },
      { status: 404 }
    );
  }

  await updateCustomProvider({
    defaultConfig: { models: catalogModels },
    id,
    userId: session.user.id,
  });

  const existingModels = await getCustomModelsByProviderId({ providerId: id });
  const existingByModelId = new Map(existingModels.map((m) => [m.modelId, m]));

  let updated = 0;
  const newModels: typeof catalogModels = [];
  const updateOps: Array<{
    capabilities?: ModelCapabilities;
    id: string;
    name?: string;
    pricing?: (typeof catalogModels)[number]["pricing"] | null;
    pricingIsCustom?: boolean;
  }> = [];

  for (const catalogModel of catalogModels) {
    const existing = existingByModelId.get(catalogModel.modelId);

    if (!existing) {
      newModels.push(catalogModel);
      continue;
    }

    const patch: {
      capabilities?: ModelCapabilities;
      name?: string;
      pricing?: (typeof catalogModels)[number]["pricing"] | null;
      pricingIsCustom?: boolean;
    } = {};
    if (!existing.nameIsCustom && existing.name !== catalogModel.name) {
      patch.name = catalogModel.name;
    }
    if (
      !existing.capabilitiesIsCustom &&
      !capabilitiesEqual(
        existing.capabilities as ModelCapabilities,
        catalogModel.capabilities
      )
    ) {
      patch.capabilities = catalogModel.capabilities;
    }
    if (!existing.pricingIsCustom) {
      patch.pricing = catalogModel.pricing ?? null;
      patch.pricingIsCustom = false;
    }

    if (Object.keys(patch).length > 0) {
      updateOps.push({ ...patch, id: existing.id });
    }
  }

  if (updateOps.length > 0) {
    await Promise.all(
      updateOps.map((op) => updateCustomModel({ ...op, providerId: id }))
    );
    updated = updateOps.length;
  }

  const created =
    newModels.length > 0
      ? await createCustomModels({
          models: newModels,
          providerId: id,
        })
      : [];

  after(async () => {
    try {
      const { syncCatalogPricingForUser } = await import("@/lib/ai/catalog");
      await syncCatalogPricingForUser(session.user.id);
    } catch {
      // ignore background sync errors
    }
  });

  return Response.json({
    imported: created.length,
    models: created,
    updated,
  });
}
