import { auth } from "@/app/(auth)/auth";
import {
  createCustomModels,
  deleteCustomModel,
  getCustomModelsByProviderId,
  getCustomProviderById,
  updateCustomModel,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

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

  if (!provider.defaultConfig) {
    return Response.json(
      { error: "No default configuration captured for this provider." },
      { status: 400 }
    );
  }

  const snapshotModels = provider.defaultConfig.models;
  const existingModels = await getCustomModelsByProviderId({ providerId: id });
  const existingByModelId = new Map(existingModels.map((m) => [m.modelId, m]));

  const snapshotModelIds = new Set(snapshotModels.map((m) => m.modelId));

  let reset = 0;

  const modelIdsToDelete = existingModels
    .filter((m) => !snapshotModelIds.has(m.modelId))
    .map((m) => m.id);

  if (modelIdsToDelete.length > 0) {
    await Promise.all(
      modelIdsToDelete.map((modelId) =>
        deleteCustomModel({ id: modelId, providerId: id })
      )
    );
  }

  const toCreate: typeof snapshotModels = [];
  const updateOps: Array<{
    capabilities: (typeof snapshotModels)[number]["capabilities"];
    capabilitiesIsCustom: boolean;
    id: string;
    name: string;
    nameIsCustom: boolean;
    pricing: (typeof snapshotModels)[number]["pricing"] | null;
    pricingIsCustom: boolean;
  }> = [];

  for (const snapshotModel of snapshotModels) {
    const existing = existingByModelId.get(snapshotModel.modelId);

    if (existing) {
      const needsUpdate =
        existing.name !== snapshotModel.name ||
        JSON.stringify(existing.capabilities) !==
          JSON.stringify(snapshotModel.capabilities) ||
        existing.input !== (snapshotModel.pricing?.input ?? null) ||
        existing.output !== (snapshotModel.pricing?.output ?? null) ||
        existing.cachedInput !== (snapshotModel.pricing?.cachedInput ?? null) ||
        existing.cachedOutput !==
          (snapshotModel.pricing?.cachedOutput ?? null) ||
        existing.nameIsCustom ||
        existing.capabilitiesIsCustom ||
        existing.pricingIsCustom;

      if (needsUpdate) {
        updateOps.push({
          capabilities: snapshotModel.capabilities,
          capabilitiesIsCustom: false,
          id: existing.id,
          name: snapshotModel.name,
          nameIsCustom: false,
          pricing: snapshotModel.pricing ?? null,
          pricingIsCustom: false,
        });
        reset += 1;
      }
    } else {
      toCreate.push(snapshotModel);
    }
  }

  if (updateOps.length > 0) {
    await Promise.all(
      updateOps.map((op) => updateCustomModel({ ...op, providerId: id }))
    );
  }

  if (toCreate.length > 0) {
    const created = await createCustomModels({
      models: toCreate,
      providerId: id,
    });
    reset += created.length;
  }

  return Response.json({ reset });
}
