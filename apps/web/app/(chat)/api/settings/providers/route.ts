import { after } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getLiveCatalogModelsForProvider } from "@/lib/ai/catalog";
import {
  createCustomModels,
  createCustomProvider,
  getCustomProvidersByUserId,
  updateCustomProvider,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { assertPublicUrl } from "@/lib/security/ssrf";

const createProviderSchema = z.object({
  apiKey: z.string().min(1),
  baseURL: z.string().url().max(512),
  name: z.string().min(1).max(128),
  providerKey: z.string().max(128).optional(),
  type: z.enum(["openai", "anthropic"]),
});

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:provider").toResponse();
  }

  const providers = await getCustomProvidersByUserId({
    userId: session.user.id,
  });

  return Response.json(
    providers.map((provider) => ({
      ...provider,
      hasDefaultConfig: Boolean(provider.defaultConfig),
    }))
  );
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:provider").toResponse();
  }

  let body: z.infer<typeof createProviderSchema>;

  try {
    const json = await request.json();
    body = createProviderSchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:provider").toResponse();
  }

  try {
    // Custom providers are user-configured and commonly point at
    // localhost / private networks (e.g. Ollama at http://localhost:11434).
    // Allow private addresses for this intentional configuration.
    await assertPublicUrl(body.baseURL, {
      allowPrivate: true,
    });
  } catch (error) {
    return new ChatbotError("bad_request:provider", {
      cause: error instanceof Error ? error.message : String(error),
    }).toResponse();
  }

  try {
    const provider = await createCustomProvider({
      apiKey: body.apiKey,
      baseURL: body.baseURL,
      name: body.name,
      providerKey: body.providerKey ?? null,
      type: body.type,
      userId: session.user.id,
    });

    if (body.providerKey) {
      const catalogModels = await getLiveCatalogModelsForProvider(
        body.providerKey
      );
      if (catalogModels.length > 0) {
        await createCustomModels({
          models: catalogModels,
          providerId: provider.id,
        });
        await updateCustomProvider({
          defaultConfig: { models: catalogModels },
          id: provider.id,
          userId: session.user.id,
        });
      }
    }

    after(async () => {
      try {
        const { syncCatalogPricingForUser } = await import("@/lib/ai/catalog");
        await syncCatalogPricingForUser(session.user.id);
      } catch {
        // ignore background sync errors
      }
    });

    return Response.json(
      {
        baseURL: provider.baseURL,
        createdAt: provider.createdAt,
        id: provider.id,
        name: provider.name,
        providerKey: provider.providerKey,
        type: provider.type,
        updatedAt: provider.updatedAt,
        userId: provider.userId,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    console.error("Failed to create provider:", error);
    return new ChatbotError("bad_request:provider", {
      cause: error,
    }).toResponse();
  }
}
