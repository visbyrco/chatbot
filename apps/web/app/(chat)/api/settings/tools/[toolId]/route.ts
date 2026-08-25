import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { CONFIGURABLE_TOOLS, SEARCH_PROVIDERS } from "@/lib/ai/tools/metadata";
import {
  deleteToolConfig,
  getToolConfigByUserId,
  upsertToolConfig,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { assertPublicUrl } from "@/lib/security/ssrf";

const normalizeBaseURL = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const baseURLField = z
  .string()
  .min(1)
  .transform(normalizeBaseURL)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "Invalid search base URL");

const upsertToolSchema = z.object({
  apiKey: z.string().min(1).optional(),
  baseURL: baseURLField.optional(),
  enabled: z.boolean(),
  provider: z.enum(SEARCH_PROVIDERS),
});

const isConfigurableTool = (toolId: string) =>
  (CONFIGURABLE_TOOLS as readonly string[]).includes(toolId);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ toolId: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:tools").toResponse();
  }

  const { toolId } = await params;

  if (!isConfigurableTool(toolId)) {
    return new ChatbotError("bad_request:tools").toResponse();
  }

  let body: z.infer<typeof upsertToolSchema>;

  try {
    const json = await request.json();
    body = upsertToolSchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:tools").toResponse();
  }

  const existing = await getToolConfigByUserId({
    provider: body.provider,
    toolId,
    userId: session.user.id,
  });

  if (!existing) {
    const missingRequired =
      body.provider === "tavily"
        ? body.apiKey === undefined
        : body.baseURL === undefined;
    if (missingRequired) {
      return new ChatbotError("bad_request:tools").toResponse();
    }
  }

  if (body.baseURL) {
    try {
      // SearXNG is user-configured and commonly self-hosted on localhost
      // or a private Docker network (e.g. http://searxng:8080). The subsequent
      // fetch re-validates with allowPrivate, so allow private here to avoid
      // rejecting legitimate self-hosted instances.
      await assertPublicUrl(body.baseURL, {
        allowPrivate: true,
      });
    } catch (error) {
      return new ChatbotError("bad_request:tools", {
        cause: error instanceof Error ? error.message : String(error),
      }).toResponse();
    }
  }

  try {
    const config = await upsertToolConfig({
      apiKey: body.apiKey,
      baseURL: body.baseURL,
      enabled: body.enabled,
      provider: body.provider,
      toolId,
      userId: session.user.id,
    });

    return Response.json({
      baseURL: config.baseURL,
      createdAt: config.createdAt,
      enabled: config.enabled,
      id: config.id,
      provider: config.provider,
      toolId: config.toolId,
      updatedAt: config.updatedAt,
      userId: config.userId,
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    console.error("Failed to save tool config:", error);
    return new ChatbotError("bad_request:tools", {
      cause: error,
    }).toResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ toolId: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:tools").toResponse();
  }

  const { toolId } = await params;

  if (!isConfigurableTool(toolId)) {
    return new ChatbotError("bad_request:tools").toResponse();
  }

  const providerParam = new URL(request.url).searchParams.get("provider");
  const parsedProvider = z.enum(SEARCH_PROVIDERS).safeParse(providerParam);

  if (!parsedProvider.success) {
    return new ChatbotError("bad_request:tools").toResponse();
  }

  await deleteToolConfig({
    provider: parsedProvider.data,
    toolId,
    userId: session.user.id,
  });

  return new Response(null, { status: 204 });
}
