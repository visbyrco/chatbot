import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  or,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { ModelCapabilities } from "@/lib/ai/models.client";
import type { VisibilityType } from "@/lib/types";
import { decrypt, encrypt, needsReEncrypt } from "../ai/encryption";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import {
  type Chat,
  type CustomModel,
  type CustomProvider,
  catalogSync,
  chat,
  customModel,
  customProvider,
  type DBMessage,
  document,
  type ModelPricing,
  message,
  type ProviderDefaultConfig,
  type Suggestion,
  stream,
  suggestion,
  type ToolConfig,
  toolConfig,
  type User,
  type UserSettings,
  user,
  userSettings,
} from "./schema";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  try {
    const [selectedUser] = await db
      .select()
      .from(user)
      .where(eq(user.clerkId, clerkId))
      .limit(1);

    return selectedUser ?? null;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function createUserFromClerk({
  clerkId,
  email,
  emailVerified,
  image,
  name,
}: {
  clerkId: string;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
  name?: string | null;
}): Promise<User> {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ChatbotError("bad_request:database", {
      cause: new Error(`Invalid email: ${email}`),
    });
  }
  try {
    const [createdUser] = await db
      .insert(user)
      .values({
        clerkId,
        email,
        emailVerified: emailVerified ?? false,
        image,
        name,
      })
      .returning();

    return createdUser;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getOrCreateUserByEmail(email: string): Promise<User> {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ChatbotError("bad_request:database", {
      cause: new Error(`Invalid email: ${email}`),
    });
  }
  try {
    const [existingUser] = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existingUser) {
      return existingUser;
    }

    const [createdUser] = await db
      .insert(user)
      .values({
        clerkId: `test-${email}`,
        email,
      })
      .returning();

    return createdUser;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    const now = new Date();
    return await db.insert(chat).values({
      createdAt: now,
      id,
      title,
      updatedAt: now,
      userId,
      visibility,
    });
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    return await db.transaction(async (tx) => {
      await tx.delete(message).where(eq(message.chatId, id));
      await tx.delete(stream).where(eq(stream.chatId, id));

      const [chatsDeleted] = await tx
        .delete(chat)
        .where(eq(chat.id, id))
        .returning();
      return chatsDeleted;
    });
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    return await db.transaction(async (tx) => {
      const userChats = await tx
        .select({ id: chat.id })
        .from(chat)
        .where(eq(chat.userId, userId));

      if (userChats.length === 0) {
        return { deletedCount: 0 };
      }

      const chatIds = userChats.map((c) => c.id);

      await tx.delete(message).where(inArray(message.chatId, chatIds));
      await tx.delete(stream).where(inArray(stream.chatId, chatIds));

      const deletedChats = await tx
        .delete(chat)
        .where(eq(chat.userId, userId))
        .returning();

      return { deletedCount: deletedChats.length };
    });
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<unknown>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.updatedAt), desc(chat.id))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        return { chats: [], hasMore: false };
      }

      const startingAfterCondition = or(
        gt(chat.updatedAt, selectedChat.updatedAt),
        and(
          eq(chat.updatedAt, selectedChat.updatedAt),
          gt(chat.id, selectedChat.id)
        )
      );
      if (!startingAfterCondition) {
        return { chats: [], hasMore: false };
      }
      filteredChats = await query(startingAfterCondition);
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        return { chats: [], hasMore: false };
      }

      const endingBeforeCondition = or(
        lt(chat.updatedAt, selectedChat.updatedAt),
        and(
          eq(chat.updatedAt, selectedChat.updatedAt),
          lt(chat.id, selectedChat.id)
        )
      );
      if (!endingBeforeCondition) {
        return { chats: [], hasMore: false };
      }
      filteredChats = await query(endingBeforeCondition);
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getAllChatsByUserId({ userId }: { userId: string }) {
  try {
    return await db
      .select({
        createdAt: chat.createdAt,
        id: chat.id,
        messageCount: count(message.id),
        title: chat.title,
        updatedAt: chat.updatedAt,
        visibility: chat.visibility,
      })
      .from(chat)
      .leftJoin(message, eq(message.chatId, chat.id))
      .where(eq(chat.userId, userId))
      .groupBy(
        chat.id,
        chat.title,
        chat.createdAt,
        chat.updatedAt,
        chat.visibility
      )
      .orderBy(desc(chat.updatedAt));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getAllMessagesByUserId({ userId }: { userId: string }) {
  try {
    return await db
      .select({
        chatId: message.chatId,
        chatTitle: chat.title,
        createdAt: message.createdAt,
        id: message.id,
        parts: message.parts,
        role: message.role,
      })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(eq(chat.userId, userId))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    if (messages.length === 0) {
      return;
    }

    await db.transaction(async (tx) => {
      await tx.insert(message).values(messages);

      const chatIds = [...new Set(messages.map((m) => m.chatId))];
      const touchedAt = new Date();
      if (chatIds.length > 0) {
        await tx
          .update(chat)
          .set({ updatedAt: touchedAt })
          .where(inArray(chat.id, chatIds));
      }
    });
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function updateMessage({
  id,
  metadata,
  parts,
}: {
  id: string;
  metadata?: DBMessage["metadata"];
  parts: DBMessage["parts"];
}) {
  try {
    return await db
      .update(message)
      .set(metadata === undefined ? { parts } : { metadata, parts })
      .where(eq(message.id, id));
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getChatsByIds({ ids }: { ids: string[] }) {
  try {
    if (ids.length === 0) {
      return [];
    }
    return await db.select().from(chat).where(inArray(chat.id, ids));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getMessagesByChatIds({ ids }: { ids: string[] }) {
  try {
    if (ids.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(message)
      .where(inArray(message.chatId, ids))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        content,
        createdAt: new Date(),
        id,
        kind,
        title,
        userId,
      })
      .returning();
  } catch (error) {
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  try {
    const docs = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt))
      .limit(1);

    const [latest] = docs;
    if (!latest) {
      throw new ChatbotError("not_found:database", "Document not found");
    }

    return await db
      .update(document)
      .set({ content })
      .where(and(eq(document.id, id), eq(document.createdAt, latest.createdAt)))
      .returning();
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", {
      cause: error,
    });
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    return await db.transaction(async (tx) => {
      await tx
        .delete(suggestion)
        .where(
          and(
            eq(suggestion.documentId, id),
            gt(suggestion.documentCreatedAt, timestamp)
          )
        );

      return await tx
        .delete(document)
        .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
        .returning();
    });
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    return await db.transaction(async (tx) => {
      const messagesToDelete = await tx
        .select({ id: message.id })
        .from(message)
        .where(
          and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
        );

      const messageIds = messagesToDelete.map(
        (currentMessage) => currentMessage.id
      );

      if (messageIds.length > 0) {
        return await tx
          .delete(message)
          .where(
            and(eq(message.chatId, chatId), inArray(message.id, messageIds))
          );
      }
    });
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await db
      .update(chat)
      .set({ title, updatedAt: new Date() })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.error("[updateChatTitle]", error);
    throw error;
  }
}

export async function pruneStreams({ chatId }: { chatId: string }) {
  try {
    await db
      .delete(stream)
      .where(
        and(
          eq(stream.chatId, chatId),
          lt(stream.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
        )
      );
    const ids = await getStreamIdsByChatId({ chatId });
    if (ids.length > 5) {
      await db
        .delete(stream)
        .where(
          and(
            eq(stream.chatId, chatId),
            inArray(stream.id, ids.slice(0, ids.length - 5))
          )
        );
    }
  } catch (error) {
    console.error("[pruneStreams]", error);
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const cutoffTime = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, cutoffTime),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ chatId, createdAt: new Date(), id: streamId });
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getCustomProvidersByUserId({
  userId,
}: {
  userId: string;
}): Promise<Omit<CustomProvider, "encryptedApiKey" | "iv">[]> {
  try {
    const providers = await db
      .select({
        baseURL: customProvider.baseURL,
        createdAt: customProvider.createdAt,
        defaultConfig: customProvider.defaultConfig,
        id: customProvider.id,
        keyVersion: customProvider.keyVersion,
        name: customProvider.name,
        providerKey: customProvider.providerKey,
        salt: customProvider.salt,
        type: customProvider.type,
        updatedAt: customProvider.updatedAt,
        userId: customProvider.userId,
      })
      .from(customProvider)
      .where(eq(customProvider.userId, userId))
      .orderBy(desc(customProvider.createdAt));

    return providers;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getCatalogSync() {
  try {
    const [sync] = await db
      .select()
      .from(catalogSync)
      .where(eq(catalogSync.id, 1))
      .limit(1);
    return sync;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function updateCatalogSync({ syncedAt }: { syncedAt: Date }) {
  try {
    const [sync] = await db
      .insert(catalogSync)
      .values({ id: 1, syncedAt })
      .onConflictDoUpdate({
        set: { syncedAt },
        target: catalogSync.id,
      })
      .returning();
    return sync;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getCustomProviderById({
  id,
}: {
  id: string;
}): Promise<CustomProvider | undefined> {
  try {
    const providers = await db
      .select()
      .from(customProvider)
      .where(eq(customProvider.id, id))
      .limit(1);

    return providers[0];
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function createCustomProvider({
  apiKey,
  baseURL,
  name,
  providerKey,
  type,
  userId,
}: {
  apiKey: string;
  baseURL: string;
  name: string;
  providerKey?: string | null;
  type: "openai" | "anthropic";
  userId: string;
}): Promise<CustomProvider> {
  try {
    const { encrypted, iv, salt, keyVersion } = encrypt(apiKey);

    const result = await db
      .insert(customProvider)
      .values({
        baseURL,
        createdAt: new Date(),
        encryptedApiKey: encrypted,
        id: generateUUID(),
        iv,
        keyVersion,
        name,
        providerKey,
        salt,
        type,
        updatedAt: new Date(),
        userId,
      })
      .returning();

    return result[0];
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function updateCustomProvider({
  apiKey,
  baseURL,
  defaultConfig,
  id,
  name,
  type,
  userId,
}: {
  apiKey?: string;
  baseURL?: string;
  defaultConfig?: ProviderDefaultConfig | null;
  id: string;
  name?: string;
  type?: "openai" | "anthropic";
  userId: string;
}): Promise<CustomProvider> {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (name !== undefined) {
    updateData.name = name;
  }
  if (baseURL !== undefined) {
    updateData.baseURL = baseURL;
  }
  if (type !== undefined) {
    updateData.type = type;
  }
  if (defaultConfig !== undefined) {
    updateData.defaultConfig = defaultConfig;
  }

  if (apiKey !== undefined) {
    const { encrypted, iv, salt, keyVersion } = encrypt(apiKey);
    updateData.encryptedApiKey = encrypted;
    updateData.iv = iv;
    updateData.salt = salt;
    updateData.keyVersion = keyVersion;
  }

  try {
    const result = await db
      .update(customProvider)
      .set(updateData)
      .where(and(eq(customProvider.id, id), eq(customProvider.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new ChatbotError("not_found:provider");
    }

    return result[0];
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function deleteCustomProvider({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<void> {
  try {
    const result = await db
      .delete(customProvider)
      .where(and(eq(customProvider.id, id), eq(customProvider.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new ChatbotError("not_found:provider");
    }
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getToolConfigsByUserId({
  userId,
}: {
  userId: string;
}): Promise<Omit<ToolConfig, "encryptedApiKey" | "iv">[]> {
  try {
    const configs = await db
      .select({
        baseURL: toolConfig.baseURL,
        createdAt: toolConfig.createdAt,
        enabled: toolConfig.enabled,
        id: toolConfig.id,
        keyVersion: toolConfig.keyVersion,
        provider: toolConfig.provider,
        salt: toolConfig.salt,
        toolId: toolConfig.toolId,
        updatedAt: toolConfig.updatedAt,
        userId: toolConfig.userId,
      })
      .from(toolConfig)
      .where(eq(toolConfig.userId, userId));

    return configs;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getToolConfigByUserId({
  provider,
  toolId,
  userId,
}: {
  provider: string;
  toolId: string;
  userId: string;
}): Promise<ToolConfig | undefined> {
  try {
    const configs = await db
      .select()
      .from(toolConfig)
      .where(
        and(
          eq(toolConfig.userId, userId),
          eq(toolConfig.toolId, toolId),
          eq(toolConfig.provider, provider)
        )
      )
      .limit(1);

    const [config] = configs;
    if (config && needsReEncrypt(config.keyVersion, config.salt)) {
      try {
        const apiKey = decrypt(
          config.encryptedApiKey,
          config.iv,
          config.salt ?? null
        );
        const { encrypted, iv, salt, keyVersion } = encrypt(apiKey);
        const [updated] = await db
          .update(toolConfig)
          .set({ encryptedApiKey: encrypted, iv, keyVersion, salt })
          .where(eq(toolConfig.id, config.id))
          .returning();
        return updated ?? config;
      } catch {
        // best-effort re-encrypt
      }
    }
    return config;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function upsertToolConfig({
  apiKey,
  baseURL,
  enabled,
  provider,
  toolId,
  userId,
}: {
  apiKey?: string;
  baseURL?: string;
  enabled: boolean;
  provider: string;
  toolId: string;
  userId: string;
}): Promise<ToolConfig> {
  try {
    const existing = await getToolConfigByUserId({ provider, toolId, userId });

    if (existing) {
      const updateData: Record<string, unknown> = {
        enabled,
        provider,
        updatedAt: new Date(),
      };
      if (baseURL !== undefined) {
        updateData.baseURL = baseURL;
      }
      if (apiKey !== undefined) {
        const { encrypted, iv, salt, keyVersion } = encrypt(apiKey);
        updateData.encryptedApiKey = encrypted;
        updateData.iv = iv;
        updateData.salt = salt;
        updateData.keyVersion = keyVersion;
      }

      const result = await db
        .update(toolConfig)
        .set(updateData)
        .where(eq(toolConfig.id, existing.id))
        .returning();

      return result[0];
    }

    if (apiKey === undefined && baseURL === undefined) {
      throw new ChatbotError("bad_request:tools");
    }

    const { encrypted, iv, salt, keyVersion } = encrypt(apiKey ?? "");

    const result = await db
      .insert(toolConfig)
      .values({
        baseURL: baseURL ?? "",
        createdAt: new Date(),
        enabled,
        encryptedApiKey: encrypted,
        id: generateUUID(),
        iv,
        keyVersion,
        provider,
        salt,
        toolId,
        updatedAt: new Date(),
        userId,
      })
      .returning();

    return result[0];
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function deleteToolConfig({
  provider,
  toolId,
  userId,
}: {
  provider: string;
  toolId: string;
  userId: string;
}): Promise<void> {
  try {
    const result = await db
      .delete(toolConfig)
      .where(
        and(
          eq(toolConfig.userId, userId),
          eq(toolConfig.toolId, toolId),
          eq(toolConfig.provider, provider)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new ChatbotError("not_found:tools");
    }
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

type UserSettingsUpdate = Partial<
  Pick<
    UserSettings,
    | "aiAbout"
    | "aiIncludeDate"
    | "aiIncludeLocation"
    | "aiInstructions"
    | "aiPersonality"
    | "aiUserName"
    | "chatModelId"
    | "enabledTools"
    | "enterBehavior"
    | "fontBody"
    | "fontHeading"
    | "fontLabel"
    | "fontMath"
    | "fontMono"
    | "identityDisplayMode"
    | "reasoningEffort"
    | "sidebarCollapsed"
    | "statsForNerds"
    | "showConversationCost"
    | "theme"
    | "titleModelId"
    | "titleReasoningEffort"
  >
>;

export async function getUserSettings({
  userId,
}: {
  userId: string;
}): Promise<UserSettings | undefined> {
  try {
    const settings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    return settings[0];
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function upsertUserSettings({
  prefs,
  userId,
}: {
  prefs: UserSettingsUpdate;
  userId: string;
}): Promise<UserSettings> {
  try {
    const existing = await getUserSettings({ userId });

    if (existing) {
      const result = await db
        .update(userSettings)
        .set({ ...prefs, updatedAt: new Date() })
        .where(eq(userSettings.id, existing.id))
        .returning();

      return result[0];
    }

    const result = await db
      .insert(userSettings)
      .values({
        ...prefs,
        createdAt: new Date(),
        id: generateUUID(),
        updatedAt: new Date(),
        userId,
      })
      .returning();

    return result[0];
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getCustomModelsByProviderId({
  providerId,
}: {
  providerId: string;
}): Promise<CustomModel[]> {
  try {
    return await db
      .select()
      .from(customModel)
      .where(eq(customModel.providerId, providerId))
      .orderBy(asc(customModel.name), asc(customModel.modelId));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getCustomModelsByProviderIds({
  providerIds,
}: {
  providerIds: string[];
}): Promise<CustomModel[]> {
  try {
    if (providerIds.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(customModel)
      .where(inArray(customModel.providerId, providerIds))
      .orderBy(asc(customModel.name), asc(customModel.modelId));
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function createCustomModel({
  capabilities,
  capabilitiesIsCustom,
  modelId,
  name,
  nameIsCustom,
  pricing,
  pricingIsCustom,
  providerId,
}: {
  capabilities: ModelCapabilities;
  capabilitiesIsCustom?: boolean;
  modelId: string;
  name: string;
  nameIsCustom?: boolean;
  pricing?: ModelPricing | null;
  pricingIsCustom?: boolean;
  providerId: string;
}): Promise<CustomModel> {
  try {
    const result = await db
      .insert(customModel)
      .values({
        capabilities,
        capabilitiesIsCustom: capabilitiesIsCustom ?? false,
        createdAt: new Date(),
        id: generateUUID(),
        ...pricing,
        modelId,
        name,
        nameIsCustom: nameIsCustom ?? false,
        pricingIsCustom: pricingIsCustom ?? false,
        providerId,
      })
      .returning();

    return result[0];
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function createCustomModels({
  models,
  providerId,
}: {
  models: Array<{
    capabilities: ModelCapabilities;
    capabilitiesIsCustom?: boolean;
    modelId: string;
    name: string;
    nameIsCustom?: boolean;
    pricing?: ModelPricing | null;
    pricingIsCustom?: boolean;
  }>;
  providerId: string;
}): Promise<CustomModel[]> {
  try {
    if (models.length === 0) {
      return [];
    }

    const result = await db
      .insert(customModel)
      .values(
        models.map((m) => ({
          capabilities: m.capabilities,
          capabilitiesIsCustom: m.capabilitiesIsCustom ?? false,
          createdAt: new Date(),
          id: generateUUID(),
          ...m.pricing,
          modelId: m.modelId,
          name: m.name,
          nameIsCustom: m.nameIsCustom ?? false,
          pricingIsCustom: m.pricingIsCustom ?? false,
          providerId,
        }))
      )
      .returning();

    return result;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function deleteCustomModel({
  id,
  providerId,
}: {
  id: string;
  providerId: string;
}): Promise<void> {
  try {
    const result = await db
      .delete(customModel)
      .where(
        and(eq(customModel.id, id), eq(customModel.providerId, providerId))
      )
      .returning();

    if (result.length === 0) {
      throw new ChatbotError("not_found:provider");
    }
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function updateCustomModel({
  capabilities,
  capabilitiesIsCustom,
  id,
  name,
  nameIsCustom,
  pricing,
  pricingIsCustom,
  providerId,
}: {
  capabilities?: ModelCapabilities;
  capabilitiesIsCustom?: boolean;
  id: string;
  name?: string;
  nameIsCustom?: boolean;
  pricing?: ModelPricing | null;
  pricingIsCustom?: boolean;
  providerId: string;
}): Promise<CustomModel> {
  try {
    const updates: Record<string, unknown> = {};
    if (capabilities !== undefined) {
      updates.capabilities = capabilities;
    }
    if (capabilitiesIsCustom !== undefined) {
      updates.capabilitiesIsCustom = capabilitiesIsCustom;
    }
    if (name !== undefined) {
      updates.name = name;
    }
    if (nameIsCustom !== undefined) {
      updates.nameIsCustom = nameIsCustom;
    }
    if (pricing !== undefined) {
      updates.input = pricing?.input ?? null;
      updates.output = pricing?.output ?? null;
      updates.cachedInput = pricing?.cachedInput ?? null;
      updates.cachedOutput = pricing?.cachedOutput ?? null;
    }
    if (pricingIsCustom !== undefined) {
      updates.pricingIsCustom = pricingIsCustom;
    }

    if (Object.keys(updates).length === 0) {
      const existing = await db
        .select()
        .from(customModel)
        .where(
          and(eq(customModel.id, id), eq(customModel.providerId, providerId))
        )
        .limit(1);
      if (existing.length === 0) {
        throw new ChatbotError("not_found:provider");
      }
      return existing[0];
    }

    const result = await db
      .update(customModel)
      .set(updates)
      .where(
        and(eq(customModel.id, id), eq(customModel.providerId, providerId))
      )
      .returning();

    if (result.length === 0) {
      throw new ChatbotError("not_found:provider");
    }

    return result[0];
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getCustomProviderByModelId({
  customProviderId,
}: {
  customProviderId: string;
}): Promise<CustomProvider | undefined> {
  try {
    const providers = await db
      .select()
      .from(customProvider)
      .where(eq(customProvider.id, customProviderId))
      .limit(1);

    return providers[0];
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}

export async function getDecryptedApiKey({
  providerId,
}: {
  providerId: string;
}): Promise<string> {
  const provider = await getCustomProviderById({ id: providerId });
  if (!provider) {
    throw new ChatbotError("not_found:provider");
  }
  try {
    const apiKey = decrypt(
      provider.encryptedApiKey,
      provider.iv,
      provider.salt ?? null
    );
    // re-encrypt path: migrate legacy rows to HKDF+salt
    if (needsReEncrypt(provider.keyVersion, provider.salt)) {
      try {
        const { encrypted, iv, salt, keyVersion } = encrypt(apiKey);
        await db
          .update(customProvider)
          .set({ encryptedApiKey: encrypted, iv, keyVersion, salt })
          .where(eq(customProvider.id, provider.id));
      } catch {
        // best-effort re-encrypt
      }
    }
    return apiKey;
  } catch (error) {
    throw new ChatbotError("bad_request:provider", { cause: error });
  }
}

export async function getCustomModelsForUser({
  userId,
}: {
  userId: string;
}): Promise<
  Array<
    CustomModel & {
      providerName: string;
      providerType: string;
    }
  >
> {
  try {
    const results = await db
      .select({
        cachedInput: customModel.cachedInput,
        cachedOutput: customModel.cachedOutput,
        capabilities: customModel.capabilities,
        capabilitiesIsCustom: customModel.capabilitiesIsCustom,
        createdAt: customModel.createdAt,
        id: customModel.id,
        input: customModel.input,
        modelId: customModel.modelId,
        name: customModel.name,
        nameIsCustom: customModel.nameIsCustom,
        output: customModel.output,
        pricingIsCustom: customModel.pricingIsCustom,
        providerId: customModel.providerId,
        providerName: customProvider.name,
        providerType: customProvider.type,
      })
      .from(customModel)
      .innerJoin(customProvider, eq(customModel.providerId, customProvider.id))
      .where(eq(customProvider.userId, userId))
      .orderBy(asc(customModel.createdAt));

    return results;
  } catch (error) {
    throw new ChatbotError("bad_request:database", { cause: error });
  }
}
