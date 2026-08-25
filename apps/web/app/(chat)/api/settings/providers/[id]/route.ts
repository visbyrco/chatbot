import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { invalidateProviderCache } from "@/lib/ai/providers";
import {
  deleteCustomProvider,
  getCustomProviderById,
  updateCustomProvider,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { assertPublicUrl } from "@/lib/security/ssrf";

const updateProviderSchema = z.object({
  apiKey: z.string().min(1).optional(),
  baseURL: z.string().url().max(512).optional(),
  name: z.string().min(1).max(128).optional(),
  type: z.enum(["openai", "anthropic"]).optional(),
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

  return Response.json({
    baseURL: provider.baseURL,
    createdAt: provider.createdAt,
    hasDefaultConfig: Boolean(provider.defaultConfig),
    id: provider.id,
    name: provider.name,
    type: provider.type,
    updatedAt: provider.updatedAt,
    userId: provider.userId,
  });
}

export async function PUT(
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

  let body: z.infer<typeof updateProviderSchema>;

  try {
    const json = await request.json();
    body = updateProviderSchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:provider").toResponse();
  }

  if (body.baseURL) {
    try {
      await assertPublicUrl(body.baseURL, {
        allowPrivate: true,
      });
    } catch (error) {
      return new ChatbotError("bad_request:provider", {
        cause: error instanceof Error ? error.message : String(error),
      }).toResponse();
    }
  }

  try {
    const updated = await updateCustomProvider({
      apiKey: body.apiKey,
      baseURL: body.baseURL,
      id,
      name: body.name,
      type: body.type,
      userId: session.user.id,
    });

    invalidateProviderCache(id);

    return Response.json({
      baseURL: updated.baseURL,
      createdAt: updated.createdAt,
      id: updated.id,
      name: updated.name,
      type: updated.type,
      updatedAt: updated.updatedAt,
      userId: updated.userId,
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    console.error("Failed to update provider:", error);
    return new ChatbotError("bad_request:provider", {
      cause: error,
    }).toResponse();
  }
}

export async function DELETE(
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

  await deleteCustomProvider({ id, userId: session.user.id });
  invalidateProviderCache(id);

  return new Response(null, { status: 204 });
}
