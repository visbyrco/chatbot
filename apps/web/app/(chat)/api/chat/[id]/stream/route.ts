import { after } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getChatById,
  getStreamIdsByChatId,
  pruneStreams,
} from "@/lib/db/queries";
import { getStreamContext } from "../../route";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return new Response(null, { status: 401 });
  }

  const chat = await getChatById({ id });
  if (!chat || chat.userId !== session.user.id) {
    return new Response(null, { status: 404 });
  }

  // If Redis not configured, no resumable stream to resume
  if (!process.env.REDIS_URL) {
    return new Response(null, { status: 204 });
  }

  const streamContext = getStreamContext();
  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  try {
    const streamIds = await getStreamIdsByChatId({ chatId: id });

    // Try most recent first; resumeExistingStream returns null if done,
    // undefined if not found – continue to next.
    for (const streamId of [...streamIds].reverse()) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential resume attempts required
      const resumed = await streamContext.resumeExistingStream(streamId);
      if (resumed) {
        try {
          after(() =>
            pruneStreams({ chatId: id }).catch(() => {
              // biome-ignore lint/suspicious/noUnusedExpressions: intentional noop
              0;
            })
          );
        } catch {
          // biome-ignore lint/suspicious/noUnusedExpressions: intentional noop
          0;
        }
        return new Response(resumed, {
          headers: {
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "Content-Type": "text/event-stream",
          },
        });
      }
    }
  } catch (error) {
    console.error("[stream GET] resume failed", error);
  }

  return new Response(null, { status: 204 });
}
