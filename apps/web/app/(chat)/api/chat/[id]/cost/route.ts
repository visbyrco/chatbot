import { auth } from "@/app/(auth)/auth";
import { calculateUsageCost, getModelPricing } from "@/lib/ai/pricing";
import {
  getChatById,
  getDocumentById,
  getMessagesByChatId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:api").toResponse();
  }

  const { id } = await params;
  const chat = await getChatById({ id });
  if (!chat || chat.userId !== session.user.id) {
    return new ChatbotError("not_found:chat").toResponse();
  }

  const messages = await getMessagesByChatId({ id });
  const costs = await Promise.all(
    messages
      .filter((message) => message.role === "assistant")
      .map(async (message) => {
        const metadata = message.metadata as {
          cacheHitInputTokens?: number;
          cacheMissInputTokens?: number;
          cost?: unknown;
          inputTokens?: number;
          modelId?: string;
          modelName?: string;
          outputTokens?: number;
          reasoningTokens?: number;
        };
        if (
          typeof metadata.cost === "number" &&
          Number.isFinite(metadata.cost)
        ) {
          return { cost: metadata.cost, metadata };
        }
        return {
          cost: calculateUsageCost(
            metadata,
            await getModelPricing(metadata.modelId)
          ),
          metadata,
        };
      })
  );

  const pricedCosts = costs.filter(
    (entry): entry is typeof entry & { cost: number } =>
      typeof entry.cost === "number"
  );
  const byModel = new Map<
    string,
    {
      cost: number | null;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      cacheMissInputTokens: number;
    }
  >();
  for (const { cost, metadata } of costs) {
    const model = metadata.modelName ?? metadata.modelId ?? "Unknown model";
    const current = byModel.get(model) ?? {
      cachedInputTokens: 0,
      cacheMissInputTokens: 0,
      cost: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    current.cost =
      current.cost === null || cost === null ? null : current.cost + cost;
    current.inputTokens += metadata.inputTokens ?? 0;
    current.outputTokens += metadata.outputTokens ?? 0;
    current.cachedInputTokens += metadata.cacheHitInputTokens ?? 0;
    current.cacheMissInputTokens += metadata.cacheMissInputTokens ?? 0;
    byModel.set(model, current);
  }

  const rawFiles = messages.flatMap((message) => {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    return parts
      .filter(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "file"
      )
      .map((part) => {
        const file = part as {
          mediaType?: string;
          name?: string;
          filename?: string;
          url?: string;
        };
        return {
          contentType: file.mediaType ?? "application/octet-stream",
          name: file.name ?? file.filename ?? "Uploaded file",
          url: file.url ?? "",
        };
      });
  });
  const uniqueFiles = [
    ...new Map(rawFiles.map((file) => [file.url || file.name, file])).values(),
  ];

  const artifactIds = messages.flatMap((message) => {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    return parts
      .filter((part) => {
        if (
          typeof part !== "object" ||
          part === null ||
          !("type" in part) ||
          typeof (part as { type: unknown }).type !== "string"
        ) {
          return false;
        }
        const t = (part as { type: string }).type;
        return (
          t === "tool-createDocument" ||
          t === "tool-updateDocument" ||
          t === "tool-writeDocument" ||
          t === "tool-editDocument" ||
          t === "tool-writeFile" ||
          t === "tool-editFile"
        );
      })
      .map((part) => {
        const { output } = part as { output?: { id?: string } };
        return output?.id;
      })
      .filter((artifactId): artifactId is string => Boolean(artifactId));
  });
  const artifacts = (
    await Promise.all(
      [...new Set(artifactIds)].map((artifactId) =>
        getDocumentById({ id: artifactId })
      )
    )
  ).filter((artifact): artifact is NonNullable<typeof artifact> =>
    Boolean(artifact)
  );

  const files = [
    ...uniqueFiles.map((f) => ({
      contentType: f.contentType,
      kind: "upload" as const,
      name: f.name,
      type: "upload" as const,
      url: f.url,
    })),
    ...artifacts.map((a) => ({
      contentType: null as string | null,
      id: a.id,
      kind: a.kind,
      name: a.title,
      title: a.title,
      type: "artifact" as const,
      url: `/api/document?id=${a.id}`,
    })),
  ];

  return Response.json({
    artifacts,
    attachments: uniqueFiles,
    byModel: [...byModel.entries()].map(([model, stats]) => ({
      model,
      ...stats,
    })),
    files,
    pricedMessages: pricedCosts.length,
    tokens: {
      cachedInput: costs.reduce(
        (sum, entry) => sum + (entry.metadata.cacheHitInputTokens ?? 0),
        0
      ),
      cacheMissInput: costs.reduce(
        (sum, entry) => sum + (entry.metadata.cacheMissInputTokens ?? 0),
        0
      ),
      input: costs.reduce(
        (sum, entry) => sum + (entry.metadata.inputTokens ?? 0),
        0
      ),
      output: costs.reduce(
        (sum, entry) => sum + (entry.metadata.outputTokens ?? 0),
        0
      ),
    },
    total:
      pricedCosts.length === costs.length
        ? pricedCosts.reduce((sum, entry) => sum + entry.cost, 0)
        : null,
    unavailableMessages: costs.length - pricedCosts.length,
  });
}
