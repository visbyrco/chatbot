import { auth } from "@/app/(auth)/auth";
import { getToolConfigsByUserId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:tools").toResponse();
  }

  const configs = await getToolConfigsByUserId({ userId: session.user.id });

  return Response.json(configs);
}
