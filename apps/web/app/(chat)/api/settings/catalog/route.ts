import { auth } from "@/app/(auth)/auth";
import { getLiveCatalogProviders } from "@/lib/ai/catalog";
import { ChatbotError } from "@/lib/errors";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:provider").toResponse();
  }

  const { generatedAt, providers } = await getLiveCatalogProviders();

  return Response.json(
    { generatedAt, providers },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
