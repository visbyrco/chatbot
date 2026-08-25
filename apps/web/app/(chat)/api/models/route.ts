import { after } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getCustomCapabilitiesForUser,
  getCustomModelsForUser,
  getProviderNamesForUser,
} from "@/lib/ai/models";
import { ChatbotError } from "@/lib/errors";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const [customModels, customCapabilities, providerNames] = await Promise.all([
    getCustomModelsForUser(session.user.id),
    getCustomCapabilitiesForUser(session.user.id),
    getProviderNamesForUser(session.user.id),
  ]);

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
      capabilities: customCapabilities,
      models: customModels,
      providerNames,
    },
    { headers: { "Cache-Control": "no-cache" } }
  );
}
