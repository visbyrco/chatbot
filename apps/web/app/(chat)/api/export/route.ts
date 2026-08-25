import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  getAllChatsByUserId,
  getChatsByIds,
  getMessagesByChatIds,
} from "@/lib/db/queries";
import type { Chat } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { chatToFilename, chatToMarkdown } from "@/lib/export/markdown";
import { checkExportRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/server/request-utils";

const exportRequestBodySchema = z.object({
  chatIds: z.array(z.uuid()).max(100).optional(),
});

/**
 * List the user's chats (with message counts) so the settings page can render
 * the export picker. Unpaginated on purpose: a personal export list should
 * show every chat.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chats = await getAllChatsByUserId({ userId: session.user.id });

  return Response.json({ chats });
}

/**
 * Export one, several, or all of the user's chats as markdown. When `chatIds`
 * is omitted or empty, every chat belonging to the user is exported.
 */
export async function POST(request: Request) {
  let chatIds: string[] | undefined;

  try {
    const body = await request.json();
    ({ chatIds } = exportRequestBodySchema.parse(body));
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const userId = session.user.id;

  try {
    await checkExportRateLimit(getClientIp(request), userId);
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    throw error;
  }

  let chats: Chat[];

  if (chatIds && chatIds.length > 0) {
    const foundChats = await getChatsByIds({ ids: chatIds });
    // Silently drop chats that don't exist or belong to another user.
    chats = foundChats.filter((chat) => chat.userId === userId);
  } else {
    const allChats = await getAllChatsByUserId({ userId });
    chats = allChats.map(({ createdAt, id, title, updatedAt, visibility }) => ({
      createdAt,
      id,
      title,
      updatedAt,
      userId,
      visibility,
    }));
  }

  const chatIdList = chats.map((c) => c.id);
  const allMessages =
    chatIdList.length > 0
      ? await getMessagesByChatIds({ ids: chatIdList })
      : [];
  const messagesByChat = new Map<string, typeof allMessages>();
  for (const m of allMessages) {
    const list = messagesByChat.get(m.chatId);
    if (list) {
      list.push(m);
    } else {
      messagesByChat.set(m.chatId, [m]);
    }
  }

  const exports = chats.map((chat) => {
    const messages = messagesByChat.get(chat.id) ?? [];
    return {
      filename: chatToFilename(chat),
      id: chat.id,
      markdown: chatToMarkdown(chat, messages),
    };
  });

  return Response.json({ exports });
}
