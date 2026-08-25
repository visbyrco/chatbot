import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createCustomModel,
  createCustomModels,
  getCustomModelsByProviderId,
  getCustomProviderById,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const createModelSchema = z.object({
  capabilities: z.object({
    reasoning: z.boolean(),
    reasoningEfforts: z.array(z.string()).optional(),
    tools: z.boolean(),
    vision: z.boolean(),
  }),
  modelId: z.string().min(1).max(256),
  name: z.string().min(1).max(256),
  pricing: z
    .object({
      cachedInput: z.number().nonnegative().nullable(),
      cachedOutput: z.number().nonnegative().nullable(),
      input: z.number().nonnegative().nullable(),
      output: z.number().nonnegative().nullable(),
    })
    .nullable()
    .optional(),
});

const bulkCreateModelsSchema = z.object({
  models: z
    .array(
      z.object({
        capabilities: z.object({
          reasoning: z.boolean(),
          reasoningEfforts: z.array(z.string()).optional(),
          tools: z.boolean(),
          vision: z.boolean(),
        }),
        modelId: z.string().min(1).max(256),
        name: z.string().min(1).max(256),
        pricing: z
          .object({
            cachedInput: z.number().nonnegative().nullable(),
            cachedOutput: z.number().nonnegative().nullable(),
            input: z.number().nonnegative().nullable(),
            output: z.number().nonnegative().nullable(),
          })
          .nullable()
          .optional(),
      })
    )
    .max(100),
});

export async function GET(
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

  const models = await getCustomModelsByProviderId({ providerId: id });

  return Response.json(models);
}

export async function POST(
  request: Request,
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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new ChatbotError("bad_request:provider").toResponse();
  }

  const bulkResult = bulkCreateModelsSchema.safeParse(json);
  if (bulkResult.success) {
    const models = await createCustomModels({
      models: bulkResult.data.models,
      providerId: id,
    });
    return Response.json(models, { status: 201 });
  }

  const singleResult = createModelSchema.safeParse(json);
  if (singleResult.success) {
    const model = await createCustomModel({
      capabilities: singleResult.data.capabilities,
      capabilitiesIsCustom: true,
      modelId: singleResult.data.modelId,
      name: singleResult.data.name,
      nameIsCustom: true,
      pricing: singleResult.data.pricing ?? null,
      pricingIsCustom: singleResult.data.pricing !== undefined,
      providerId: id,
    });
    return Response.json(model, { status: 201 });
  }

  return new ChatbotError("bad_request:provider").toResponse();
}
