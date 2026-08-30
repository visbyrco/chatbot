import { auth } from "@/app/(auth)/auth";
import { publishAbort } from "@/lib/ai/generation-abort";
import { getChatById } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return new ChatbotError("bad_request:api", "Missing chat id").toResponse();
  }

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });
  if (chat && chat.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }
  // Allow abort even for new chats that have not been persisted yet.
  // If the chat exists, ownership was already verified; if it does not
  // exist, we still abort any in-flight generation for this id (new-chat
  // case) and return 204 to avoid leaking existence.
  await publishAbort(id);

  return new Response(null, { status: 204 });
}
