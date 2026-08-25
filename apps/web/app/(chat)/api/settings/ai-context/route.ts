import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const aiContextSchema = z
  .object({
    aiAbout: z.string().max(4000).nullable().optional(),
    aiIncludeDate: z.boolean().nullable().optional(),
    aiIncludeLocation: z.boolean().nullable().optional(),
    aiInstructions: z.string().max(4000).nullable().optional(),
    aiPersonality: z.string().max(512).nullable().optional(),
    aiUserName: z.string().max(128).nullable().optional(),
  })
  .strict();

const AI_CONTEXT_KEYS = [
  "aiAbout",
  "aiIncludeDate",
  "aiIncludeLocation",
  "aiInstructions",
  "aiPersonality",
  "aiUserName",
] as const;

function normalizeAiContext(
  settings: Awaited<ReturnType<typeof getUserSettings>>
) {
  const result: Record<string, unknown> = {};
  for (const key of AI_CONTEXT_KEYS) {
    result[key] =
      (settings as Record<string, unknown> | undefined)?.[key] ?? null;
  }
  return result;
}

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:api").toResponse();
  }

  const settings = await getUserSettings({ userId: session.user.id });

  return Response.json(normalizeAiContext(settings));
}

export async function PUT(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:api").toResponse();
  }

  let body: z.infer<typeof aiContextSchema>;

  try {
    const json = await request.json();
    body = aiContextSchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  // Normalize empty strings to null
  const prefs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      prefs[key] = value.trim() === "" ? null : value.trim();
    } else {
      prefs[key] = value;
    }
  }

  try {
    const settings = await upsertUserSettings({
      prefs: prefs as Parameters<typeof upsertUserSettings>[0]["prefs"],
      userId: session.user.id,
    });

    return Response.json(normalizeAiContext(settings));
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    console.error("Failed to save AI context:", error);
    return new ChatbotError("bad_request:api", { cause: error }).toResponse();
  }
}
