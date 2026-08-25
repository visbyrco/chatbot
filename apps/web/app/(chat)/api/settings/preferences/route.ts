import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { TOOL_IDS } from "@/lib/ai/tools/metadata";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import {
  ENTER_BEHAVIORS,
  IDENTITY_DISPLAY_MODES,
  PREFERENCE_KEYS,
  REASONING_EFFORTS,
  THEMES,
} from "@/lib/preferences";

const preferenceSchema = z
  .object({
    chatModelId: z.string().max(512).nullable().optional(),
    enabledTools: z.array(z.enum(TOOL_IDS)).nullable().optional(),
    enterBehavior: z.enum(ENTER_BEHAVIORS).nullable().optional(),
    fontBody: z.string().max(64).nullable().optional(),
    fontHeading: z.string().max(64).nullable().optional(),
    fontLabel: z.string().max(64).nullable().optional(),
    fontMath: z.string().max(64).nullable().optional(),
    fontMono: z.string().max(64).nullable().optional(),
    identityDisplayMode: z.enum(IDENTITY_DISPLAY_MODES).nullable().optional(),
    reasoningEffort: z.enum(REASONING_EFFORTS).nullable().optional(),
    showConversationCost: z.boolean().nullable().optional(),
    sidebarCollapsed: z.boolean().nullable().optional(),
    statsForNerds: z.boolean().nullable().optional(),
    theme: z.enum(THEMES).nullable().optional(),
    titleModelId: z.string().max(512).nullable().optional(),
    titleReasoningEffort: z.enum(REASONING_EFFORTS).nullable().optional(),
  })
  .strict();

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:api").toResponse();
  }

  const settings = await getUserSettings({ userId: session.user.id });

  const prefs: Record<string, unknown> = {};
  if (settings) {
    for (const key of PREFERENCE_KEYS) {
      prefs[key] = settings[key] ?? null;
    }
  }

  return Response.json(prefs);
}

export async function PUT(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:api").toResponse();
  }

  let body: z.infer<typeof preferenceSchema>;

  try {
    const json = await request.json();
    body = preferenceSchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const settings = await upsertUserSettings({
      prefs: body,
      userId: session.user.id,
    });

    const prefs: Record<string, unknown> = {};
    for (const key of PREFERENCE_KEYS) {
      prefs[key] = settings[key] ?? null;
    }

    return Response.json(prefs);
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    console.error("Failed to save preferences:", error);
    return new ChatbotError("bad_request:api", { cause: error }).toResponse();
  }
}
