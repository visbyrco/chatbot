import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { deleteAllChatsByUserId, getChatsByUserId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { checkHistoryRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/server/request-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") || "10", 10), 1),
    50
  );
  const startingAfter = searchParams.get("starting_after");
  const endingBefore = searchParams.get("ending_before");

  if (startingAfter && endingBefore) {
    return new ChatbotError(
      "bad_request:api",
      "Only one of starting_after or ending_before can be provided."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  try {
    await checkHistoryRateLimit(
      getClientIp(request as unknown as Request),
      session.user.id
    );
  } catch (error) {
    if (error instanceof ChatbotError) {
      // Fail-open for history: cold-start Redis not ready should not block sidebar.
      // Check `type` (not message) because message is user-facing (e.g. "You've reached the message limit...").
      if (error.type === "rate_limit") {
        console.warn("[history] rate-limit fail-open", error.message);
      } else {
        return error.toResponse();
      }
    } else {
      throw error;
    }
  }

  try {
    const chats = await getChatsByUserId({
      endingBefore,
      id: session.user.id,
      limit,
      startingAfter,
    });
    return Response.json(chats);
  } catch (error) {
    if (
      error instanceof ChatbotError &&
      error.message.includes("not_found:database")
    ) {
      // Cursor points to deleted chat → return empty page not 500
      return Response.json({ chats: [], hasMore: false });
    }
    throw error;
  }
}

export async function DELETE() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const result = await deleteAllChatsByUserId({ userId: session.user.id });

  return Response.json(result, { status: 200 });
}
