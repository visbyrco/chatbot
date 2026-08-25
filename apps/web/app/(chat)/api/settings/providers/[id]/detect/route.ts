import { auth } from "@/app/(auth)/auth";
import { getLiveCatalogModelsForProvider } from "@/lib/ai/catalog";
import {
  createCustomModels,
  getCustomModelsByProviderId,
  getCustomProviderById,
  getDecryptedApiKey,
  updateCustomProvider,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { checkDetectRateLimit } from "@/lib/ratelimit";
import { assertPublicUrl } from "@/lib/security/ssrf";
import { getClientIp } from "@/lib/server/request-utils";

const FETCH_TIMEOUT_MS = 5000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:provider").toResponse();
  }

  try {
    await checkDetectRateLimit(getClientIp(request), session.user.id);
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    throw error;
  }

  const { id } = await params;
  const provider = await getCustomProviderById({ id });

  if (!provider || provider.userId !== session.user.id) {
    return new ChatbotError("not_found:provider").toResponse();
  }

  if (provider.type !== "openai") {
    return Response.json(
      {
        error:
          "Auto-detection is only supported for OpenAI-compatible endpoints.",
      },
      { status: 400 }
    );
  }

  const apiKey = await getDecryptedApiKey({ providerId: id });
  const normalizedBaseURL = provider.baseURL.replace(/\/$/, "");

  try {
    const targetUrl = `${normalizedBaseURL}/models`;
    await assertPublicUrl(targetUrl, { allowPrivate: true });
    const response = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return Response.json(
        {
          error: `Failed to fetch models: ${response.status} ${response.statusText}`,
        },
        { status: 400 }
      );
    }

    const data = await response.json();
    const models = data.data ?? [];

    const catalogModels = provider.providerKey
      ? await getLiveCatalogModelsForProvider(provider.providerKey)
      : [];
    const catalogMap = new Map(catalogModels.map((m) => [m.modelId, m]));

    const modelEntries: Array<{
      capabilities: {
        reasoning: boolean;
        tools: boolean;
        vision: boolean;
        reasoningEfforts?: string[];
      };
      modelId: string;
      name: string;
    }> = models.map((m: { id: string }) => {
      const catalogEntry = catalogMap.get(m.id);
      return {
        capabilities: catalogEntry?.capabilities ?? {
          reasoning: false,
          tools: true,
          vision: false,
        },
        modelId: m.id,
        name: catalogEntry?.name ?? m.id,
      };
    });

    await updateCustomProvider({
      defaultConfig: { models: modelEntries },
      id,
      userId: session.user.id,
    });

    const existingModels = await getCustomModelsByProviderId({
      providerId: id,
    });
    const existingModelIds = new Set(existingModels.map((m) => m.modelId));
    const newModels = modelEntries.filter(
      (m) => !existingModelIds.has(m.modelId)
    );

    const created = await createCustomModels({
      models: newModels,
      providerId: id,
    });

    return Response.json({
      detected: created.length,
      models: created,
    });
  } catch (error) {
    console.error("Provider auto-detect failed:", error);
    let message = "Failed to detect models.";
    if (error instanceof ChatbotError) {
      message = error.cause ? `${error.message} ${error.cause}` : error.message;
    } else if (error instanceof Error) {
      message = `Failed to detect models: ${error.message}`;
    }
    return Response.json(
      {
        error: message,
      },
      { status: 400 }
    );
  }
}
