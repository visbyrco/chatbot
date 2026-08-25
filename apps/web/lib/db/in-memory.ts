import "server-only";

import type { ArtifactKind } from "@/components/chat/artifact";
import type { ModelCapabilities } from "@/lib/ai/models.client";
import type { VisibilityType } from "@/lib/types";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import type {
  Chat,
  CustomModel,
  CustomProvider,
  DBMessage,
  Document,
  ModelPricing,
  ProviderDefaultConfig,
  Stream,
  Suggestion,
  ToolConfig,
  User,
  UserSettings,
} from "./schema";

const GLOBAL_STORE_KEY = "__chatbotInMemoryStore";

type Store = {
  users: Map<string, User>;
  chats: Map<string, Chat>;
  messages: Map<string, DBMessage>;
  documents: Document[];
  suggestions: Map<string, Suggestion>;
  streams: Map<string, Stream>;
  providers: Map<string, CustomProvider>;
  models: Map<string, CustomModel>;
  apiKeys: Map<string, string>;
  toolConfigs: Map<string, ToolConfig>;
  toolApiKeys: Map<string, string>;
  userSettings: Map<string, UserSettings>;
  catalogSync?: { id: number; syncedAt: Date | null };
};

function getOrCreateStore(): Store {
  const globalStore = globalThis as unknown as Record<
    string,
    Store | undefined
  >;
  if (!globalStore[GLOBAL_STORE_KEY]) {
    globalStore[GLOBAL_STORE_KEY] = {
      apiKeys: new Map(),
      catalogSync: undefined,
      chats: new Map(),
      documents: [],
      messages: new Map(),
      models: new Map(),
      providers: new Map(),
      streams: new Map(),
      suggestions: new Map(),
      toolApiKeys: new Map(),
      toolConfigs: new Map(),
      userSettings: new Map(),
      users: new Map(),
    };
  }
  return globalStore[GLOBAL_STORE_KEY] as Store;
}

const store: Store = getOrCreateStore();

function seedProviderAndModel(userId: string) {
  const now = new Date();
  const providerId = generateUUID();
  const provider: CustomProvider = {
    baseURL: "http://localhost:9999/v1",
    createdAt: now,
    defaultConfig: null,
    encryptedApiKey: "",
    id: providerId,
    iv: "",
    keyVersion: 1,
    name: "Mock Provider",
    providerKey: null,
    salt: null,
    type: "openai",
    updatedAt: now,
    userId,
  };
  store.providers.set(providerId, provider);

  const model: CustomModel = {
    cachedInput: null,
    cachedOutput: null,
    capabilities: { reasoning: false, tools: true, vision: false },
    capabilitiesIsCustom: false,
    createdAt: now,
    id: generateUUID(),
    input: null,
    modelId: "chat-model",
    name: "Mock Chat Model",
    nameIsCustom: false,
    output: null,
    pricingIsCustom: false,
    providerId,
  };
  store.models.set(model.id, model);
}

function getUserByClerkId(clerkId: string): User | null {
  for (const user of store.users.values()) {
    if (user.clerkId === clerkId) {
      return user;
    }
  }
  return null;
}

function createUserFromClerk({
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
}): User {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ChatbotError("bad_request:database", {
      cause: new Error(`Invalid email: ${email}`),
    });
  }
  const now = new Date();
  const user: User = {
    clerkId,
    createdAt: now,
    email,
    emailVerified: emailVerified ?? false,
    id: generateUUID(),
    image: image ?? null,
    name: name ?? null,
    updatedAt: now,
  };
  store.users.set(user.id, user);
  seedProviderAndModel(user.id);
  return user;
}

function getOrCreateUserByEmail(email: string): User {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ChatbotError("bad_request:database", {
      cause: new Error(`Invalid email: ${email}`),
    });
  }
  for (const user of store.users.values()) {
    if (user.email === email) {
      return user;
    }
  }
  return createUserFromClerk({ clerkId: `test-${email}`, email });
}

function saveChat({
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
  const now = new Date();
  const chat: Chat = {
    createdAt: now,
    id,
    title,
    updatedAt: now,
    userId,
    visibility,
  };
  store.chats.set(id, chat);
}

function deleteChatById({ id }: { id: string }): Chat | undefined {
  for (const [messageId, message] of store.messages) {
    if (message.chatId === id) {
      store.messages.delete(messageId);
    }
  }
  for (const [streamId, stream] of store.streams) {
    if (stream.chatId === id) {
      store.streams.delete(streamId);
    }
  }
  const chat = store.chats.get(id);
  if (chat) {
    store.chats.delete(id);
  }
  return chat;
}

function deleteAllChatsByUserId({ userId }: { userId: string }) {
  const chatIds = [...store.chats.values()]
    .filter((chat) => chat.userId === userId)
    .map((chat) => chat.id);

  if (chatIds.length === 0) {
    return { deletedCount: 0 };
  }

  const chatIdSet = new Set(chatIds);
  for (const [messageId, message] of store.messages) {
    if (chatIdSet.has(message.chatId)) {
      store.messages.delete(messageId);
    }
  }
  for (const [streamId, stream] of store.streams) {
    if (chatIdSet.has(stream.chatId)) {
      store.streams.delete(streamId);
    }
  }
  for (const id of chatIds) {
    store.chats.delete(id);
  }

  return { deletedCount: chatIds.length };
}

function getChatsByUserId({
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
  let chats = [...store.chats.values()].filter((chat) => chat.userId === id);

  if (startingAfter) {
    const cursor = store.chats.get(startingAfter);
    if (!cursor) {
      return { chats: [], hasMore: false };
    }
    chats = chats.filter(
      (chat) =>
        chat.updatedAt.getTime() > cursor.updatedAt.getTime() ||
        (chat.updatedAt.getTime() === cursor.updatedAt.getTime() &&
          chat.id > cursor.id)
    );
  } else if (endingBefore) {
    const cursor = store.chats.get(endingBefore);
    if (!cursor) {
      return { chats: [], hasMore: false };
    }
    chats = chats.filter(
      (chat) =>
        chat.updatedAt.getTime() < cursor.updatedAt.getTime() ||
        (chat.updatedAt.getTime() === cursor.updatedAt.getTime() &&
          chat.id < cursor.id)
    );
  }

  chats.sort((a, b) => {
    const diff = b.updatedAt.getTime() - a.updatedAt.getTime();
    return diff === 0 ? b.id.localeCompare(a.id) : diff;
  });

  const hasMore = chats.length > limit;

  return {
    chats: hasMore ? chats.slice(0, limit) : chats,
    hasMore,
  };
}

function getAllChatsByUserId({ userId }: { userId: string }) {
  return [...store.chats.values()]
    .filter((chat) => chat.userId === userId)
    .map((chat) => ({
      createdAt: chat.createdAt,
      id: chat.id,
      messageCount: [...store.messages.values()].filter(
        (message) => message.chatId === chat.id
      ).length,
      title: chat.title,
      updatedAt: chat.updatedAt,
      visibility: chat.visibility,
    }))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

function getAllMessagesByUserId({ userId }: { userId: string }) {
  const chatTitleById = new Map(
    [...store.chats.values()]
      .filter((chat) => chat.userId === userId)
      .map((chat) => [chat.id, chat.title])
  );

  return [...store.messages.values()]
    .filter((message) => chatTitleById.has(message.chatId))
    .map((message) => ({
      chatId: message.chatId,
      chatTitle: chatTitleById.get(message.chatId),
      createdAt: message.createdAt,
      id: message.id,
      parts: message.parts,
      role: message.role,
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function getChatById({ id }: { id: string }): Chat | null {
  return store.chats.get(id) ?? null;
}

function getChatsByIds({ ids }: { ids: string[] }): Chat[] {
  if (ids.length === 0) {
    return [];
  }
  const set = new Set(ids);
  return [...store.chats.values()].filter((c) => set.has(c.id));
}

function getMessagesByChatIds({ ids }: { ids: string[] }): DBMessage[] {
  if (ids.length === 0) {
    return [];
  }
  const set = new Set(ids);
  return [...store.messages.values()]
    .filter((m) => set.has(m.chatId))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function saveMessages({ messages }: { messages: DBMessage[] }) {
  if (messages.length === 0) {
    return;
  }
  for (const message of messages) {
    store.messages.set(message.id, message);
  }
  const touchedAt = new Date();
  const chatIds = new Set(messages.map((message) => message.chatId));
  for (const chatId of chatIds) {
    const existing = store.chats.get(chatId);
    if (existing) {
      store.chats.set(chatId, { ...existing, updatedAt: touchedAt });
    }
  }
}

function updateMessage({
  id,
  metadata,
  parts,
}: {
  id: string;
  metadata?: DBMessage["metadata"];
  parts: DBMessage["parts"];
}) {
  const existing = store.messages.get(id);
  if (!existing) {
    return;
  }
  store.messages.set(id, {
    ...existing,
    parts,
    ...(metadata === undefined ? {} : { metadata }),
  });
}

function getMessagesByChatId({ id }: { id: string }): DBMessage[] {
  return [...store.messages.values()]
    .filter((message) => message.chatId === id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function saveDocument({
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
}): Document[] {
  const document: Document = {
    content,
    createdAt: new Date(),
    id,
    kind,
    title,
    userId,
  };
  store.documents.push(document);
  return [document];
}

function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}): Document[] {
  const matching = store.documents.filter((document) => document.id === id);
  if (matching.length === 0) {
    throw new ChatbotError("not_found:database", "Document not found");
  }

  const latest = matching.reduce((a, b) =>
    a.createdAt.getTime() >= b.createdAt.getTime() ? a : b
  );
  const index = store.documents.findIndex(
    (document) =>
      document.id === id &&
      document.createdAt.getTime() === latest.createdAt.getTime()
  );
  const updated: Document = { ...latest, content };
  store.documents[index] = updated;
  return [updated];
}

function getDocumentsById({ id }: { id: string }): Document[] {
  return store.documents
    .filter((document) => document.id === id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function getDocumentById({ id }: { id: string }): Document | undefined {
  const matching = store.documents.filter((document) => document.id === id);
  if (matching.length === 0) {
    return;
  }
  return matching.reduce((a, b) =>
    a.createdAt.getTime() >= b.createdAt.getTime() ? a : b
  );
}

function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}): Document[] {
  for (const [suggestionId, suggestion] of store.suggestions) {
    if (
      suggestion.documentId === id &&
      suggestion.documentCreatedAt.getTime() > timestamp.getTime()
    ) {
      store.suggestions.delete(suggestionId);
    }
  }

  const toDelete = store.documents.filter(
    (document) =>
      document.id === id && document.createdAt.getTime() > timestamp.getTime()
  );
  for (const document of toDelete) {
    const index = store.documents.indexOf(document);
    if (index !== -1) {
      store.documents.splice(index, 1);
    }
  }
  return toDelete;
}

function saveSuggestions({ suggestions }: { suggestions: Suggestion[] }) {
  for (const suggestion of suggestions) {
    store.suggestions.set(suggestion.id, suggestion);
  }
}

function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}): Suggestion[] {
  return [...store.suggestions.values()].filter(
    (suggestion) => suggestion.documentId === documentId
  );
}

function getMessageById({ id }: { id: string }): DBMessage[] {
  const message = store.messages.get(id);
  return message ? [message] : [];
}

function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  for (const [messageId, message] of store.messages) {
    if (
      message.chatId === chatId &&
      message.createdAt.getTime() >= timestamp.getTime()
    ) {
      store.messages.delete(messageId);
    }
  }
}

function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  const existing = store.chats.get(chatId);
  if (!existing) {
    return;
  }
  store.chats.set(chatId, { ...existing, visibility });
}

function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  const existing = store.chats.get(chatId);
  if (!existing) {
    return;
  }
  store.chats.set(chatId, { ...existing, title, updatedAt: new Date() });
}

function pruneStreams({ chatId }: { chatId: string }) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [sid, s] of store.streams) {
    if (s.chatId === chatId && s.createdAt.getTime() < cutoff) {
      store.streams.delete(sid);
    }
  }
  const ids = [...store.streams.values()]
    .filter((s) => s.chatId === chatId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((s) => s.id);
  if (ids.length > 5) {
    for (const sid of ids.slice(0, ids.length - 5)) {
      store.streams.delete(sid);
    }
  }
}

function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}): number {
  const cutoffTime = new Date(Date.now() - differenceInHours * 60 * 60 * 1000);

  let count = 0;
  for (const message of store.messages.values()) {
    const chat = store.chats.get(message.chatId);
    if (
      chat &&
      chat.userId === id &&
      message.role === "user" &&
      message.createdAt.getTime() >= cutoffTime.getTime()
    ) {
      count += 1;
    }
  }
  return count;
}

function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  const stream: Stream = {
    chatId,
    createdAt: new Date(),
    id: streamId,
  };
  store.streams.set(streamId, stream);
}

function getStreamIdsByChatId({ chatId }: { chatId: string }): string[] {
  return [...store.streams.values()]
    .filter((stream) => stream.chatId === chatId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((stream) => stream.id);
}

function getCustomProvidersByUserId({
  userId,
}: {
  userId: string;
}): Omit<CustomProvider, "encryptedApiKey" | "iv">[] {
  return [...store.providers.values()]
    .filter((provider) => provider.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((provider) => ({
      baseURL: provider.baseURL,
      createdAt: provider.createdAt,
      defaultConfig: provider.defaultConfig,
      id: provider.id,
      keyVersion: provider.keyVersion,
      name: provider.name,
      providerKey: provider.providerKey,
      salt: provider.salt,
      type: provider.type,
      updatedAt: provider.updatedAt,
      userId: provider.userId,
    }));
}

function getCatalogSync() {
  return store.catalogSync;
}

function updateCatalogSync({ syncedAt }: { syncedAt: Date }) {
  store.catalogSync = { id: 1, syncedAt };
  return store.catalogSync;
}

function getCustomProviderById({
  id,
}: {
  id: string;
}): CustomProvider | undefined {
  return store.providers.get(id);
}

function createCustomProvider({
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
}): CustomProvider {
  const now = new Date();
  const provider: CustomProvider = {
    baseURL,
    createdAt: now,
    defaultConfig: null,
    encryptedApiKey: "",
    id: generateUUID(),
    iv: "",
    keyVersion: 1,
    name,
    providerKey: providerKey ?? null,
    salt: null,
    type,
    updatedAt: now,
    userId,
  };
  store.providers.set(provider.id, provider);
  store.apiKeys.set(provider.id, apiKey);
  return provider;
}

function updateCustomProvider({
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
}): CustomProvider {
  const existing = store.providers.get(id);
  if (!existing || existing.userId !== userId) {
    throw new ChatbotError("not_found:provider");
  }

  const updated: CustomProvider = {
    ...existing,
    ...(name === undefined ? {} : { name }),
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(type === undefined ? {} : { type }),
    ...(defaultConfig === undefined ? {} : { defaultConfig }),
    updatedAt: new Date(),
  };
  if (apiKey !== undefined) {
    store.apiKeys.set(id, apiKey);
  }
  store.providers.set(id, updated);
  return updated;
}

function deleteCustomProvider({ id, userId }: { id: string; userId: string }) {
  const existing = store.providers.get(id);
  if (!existing || existing.userId !== userId) {
    throw new ChatbotError("not_found:provider");
  }
  for (const [modelId, model] of store.models) {
    if (model.providerId === id) {
      store.models.delete(modelId);
    }
  }
  store.apiKeys.delete(id);
  store.providers.delete(id);
}

function getCustomModelsByProviderId({
  providerId,
}: {
  providerId: string;
}): CustomModel[] {
  return [...store.models.values()]
    .filter((model) => model.providerId === providerId)
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.modelId.localeCompare(b.modelId)
    );
}

function getCustomModelsByProviderIds({
  providerIds,
}: {
  providerIds: string[];
}): CustomModel[] {
  if (providerIds.length === 0) {
    return [];
  }
  const idSet = new Set(providerIds);
  return [...store.models.values()]
    .filter((model) => idSet.has(model.providerId))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.modelId.localeCompare(b.modelId)
    );
}

function createCustomModel({
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
}): CustomModel {
  const model: CustomModel = {
    cachedInput: pricing?.cachedInput ?? null,
    cachedOutput: pricing?.cachedOutput ?? null,
    capabilities,
    capabilitiesIsCustom: capabilitiesIsCustom ?? false,
    createdAt: new Date(),
    id: generateUUID(),
    input: pricing?.input ?? null,
    modelId,
    name,
    nameIsCustom: nameIsCustom ?? false,
    output: pricing?.output ?? null,
    pricingIsCustom: pricingIsCustom ?? false,
    providerId,
  };
  store.models.set(model.id, model);
  return model;
}

function createCustomModels({
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
}): CustomModel[] {
  if (models.length === 0) {
    return [];
  }

  const created = models.map((model) => ({
    cachedInput: model.pricing?.cachedInput ?? null,
    cachedOutput: model.pricing?.cachedOutput ?? null,
    capabilities: model.capabilities,
    capabilitiesIsCustom: model.capabilitiesIsCustom ?? false,
    createdAt: new Date(),
    id: generateUUID(),
    input: model.pricing?.input ?? null,
    modelId: model.modelId,
    name: model.name,
    nameIsCustom: model.nameIsCustom ?? false,
    output: model.pricing?.output ?? null,
    pricingIsCustom: model.pricingIsCustom ?? false,
    providerId,
  }));
  for (const model of created) {
    store.models.set(model.id, model);
  }
  return created;
}

function deleteCustomModel({
  id,
  providerId,
}: {
  id: string;
  providerId: string;
}) {
  const existing = store.models.get(id);
  if (!existing || existing.providerId !== providerId) {
    throw new ChatbotError("not_found:provider");
  }
  store.models.delete(id);
}

function updateCustomModel({
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
}): CustomModel {
  const existing = store.models.get(id);
  if (!existing || existing.providerId !== providerId) {
    throw new ChatbotError("not_found:provider");
  }
  const updated: CustomModel = {
    ...existing,
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(capabilitiesIsCustom === undefined ? {} : { capabilitiesIsCustom }),
    ...(name === undefined ? {} : { name }),
    ...(nameIsCustom === undefined ? {} : { nameIsCustom }),
    ...(pricing === undefined
      ? {}
      : {
          cachedInput: pricing?.cachedInput ?? null,
          cachedOutput: pricing?.cachedOutput ?? null,
          input: pricing?.input ?? null,
          output: pricing?.output ?? null,
        }),
    ...(pricingIsCustom === undefined ? {} : { pricingIsCustom }),
  };
  store.models.set(id, updated);
  return updated;
}

function getCustomProviderByModelId({
  customProviderId,
}: {
  customProviderId: string;
}): CustomProvider | undefined {
  return store.providers.get(customProviderId);
}

function getDecryptedApiKey({ providerId }: { providerId: string }): string {
  const provider = store.providers.get(providerId);
  if (!provider) {
    throw new ChatbotError("not_found:provider");
  }
  const apiKey = store.apiKeys.get(providerId);
  if (apiKey === undefined) {
    throw new ChatbotError("not_found:provider");
  }
  return apiKey;
}

function getToolConfigKey({
  provider,
  toolId,
  userId,
}: {
  provider: string;
  toolId: string;
  userId: string;
}) {
  return `${userId}:${toolId}:${provider}`;
}

function getToolConfigsByUserId({
  userId,
}: {
  userId: string;
}): Omit<ToolConfig, "encryptedApiKey" | "iv">[] {
  return [...store.toolConfigs.values()]
    .filter((config) => config.userId === userId)
    .map(
      ({
        baseURL,
        createdAt,
        enabled,
        id,
        keyVersion,
        provider,
        salt,
        toolId,
        updatedAt,
        userId: configUserId,
      }) => ({
        baseURL,
        createdAt,
        enabled,
        id,
        keyVersion,
        provider,
        salt,
        toolId,
        updatedAt,
        userId: configUserId,
      })
    );
}

function getToolConfigByUserId({
  provider,
  toolId,
  userId,
}: {
  provider: string;
  toolId: string;
  userId: string;
}): ToolConfig | undefined {
  return store.toolConfigs.get(getToolConfigKey({ provider, toolId, userId }));
}

function upsertToolConfig({
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
}): ToolConfig {
  const key = getToolConfigKey({ provider, toolId, userId });
  const existing = store.toolConfigs.get(key);
  const now = new Date();

  if (existing) {
    const updated: ToolConfig = {
      ...existing,
      enabled,
      provider,
      updatedAt: now,
    };
    if (baseURL !== undefined) {
      updated.baseURL = baseURL;
    }
    if (apiKey !== undefined) {
      store.toolApiKeys.set(key, apiKey);
    }
    store.toolConfigs.set(key, updated);
    return updated;
  }

  const config: ToolConfig = {
    baseURL: baseURL ?? "",
    createdAt: now,
    enabled,
    encryptedApiKey: "",
    id: generateUUID(),
    iv: "",
    keyVersion: 1,
    provider,
    salt: null,
    toolId,
    updatedAt: now,
    userId,
  };
  store.toolConfigs.set(key, config);
  if (apiKey !== undefined) {
    store.toolApiKeys.set(key, apiKey);
  }
  return config;
}

function deleteToolConfig({
  provider,
  toolId,
  userId,
}: {
  provider: string;
  toolId: string;
  userId: string;
}) {
  const key = getToolConfigKey({ provider, toolId, userId });
  if (!store.toolConfigs.has(key)) {
    throw new ChatbotError("not_found:tools");
  }
  store.toolConfigs.delete(key);
  store.toolApiKeys.delete(key);
}

function getCustomModelsForUser({ userId }: { userId: string }): Array<
  CustomModel & {
    providerName: string;
    providerType: string;
  }
> {
  return [...store.providers.values()]
    .filter((provider) => provider.userId === userId)
    .flatMap((provider) =>
      [...store.models.values()]
        .filter((model) => model.providerId === provider.id)
        .map((model) => ({
          ...model,
          providerName: provider.name,
          providerType: provider.type,
        }))
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
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

function getUserSettings({
  userId,
}: {
  userId: string;
}): UserSettings | undefined {
  return store.userSettings.get(userId);
}

function upsertUserSettings({
  prefs,
  userId,
}: {
  prefs: UserSettingsUpdate;
  userId: string;
}): UserSettings {
  const existing = store.userSettings.get(userId);
  const now = new Date();

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(prefs)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  const settings: UserSettings = {
    aiAbout: null,
    aiIncludeDate: null,
    aiIncludeLocation: null,
    aiInstructions: null,
    aiPersonality: null,
    aiUserName: null,
    chatModelId: null,
    createdAt: existing?.createdAt ?? now,
    enabledTools: null,
    enterBehavior: null,
    fontBody: null,
    fontHeading: null,
    fontLabel: null,
    fontMath: null,
    fontMono: null,
    id: existing?.id ?? generateUUID(),
    identityDisplayMode: null,
    reasoningEffort: null,
    showConversationCost: null,
    sidebarCollapsed: null,
    statsForNerds: null,
    theme: null,
    titleModelId: null,
    titleReasoningEffort: null,
    updatedAt: now,
    userId,
    ...existing,
    ...updates,
  };
  store.userSettings.set(userId, settings);
  return settings;
}

export const inMemoryQueries = {
  createCustomModel,
  createCustomModels,
  createCustomProvider,
  createStreamId,
  createUserFromClerk,
  deleteAllChatsByUserId,
  deleteChatById,
  deleteCustomModel,
  deleteCustomProvider,
  deleteDocumentsByIdAfterTimestamp,
  deleteMessagesByChatIdAfterTimestamp,
  deleteToolConfig,
  getAllChatsByUserId,
  getAllMessagesByUserId,
  getCatalogSync,
  getChatById,
  getChatsByIds,
  getChatsByUserId,
  getCustomModelsByProviderId,
  getCustomModelsByProviderIds,
  getCustomModelsForUser,
  getCustomProviderById,
  getCustomProviderByModelId,
  getCustomProvidersByUserId,
  getDecryptedApiKey,
  getDocumentById,
  getDocumentsById,
  getMessageById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getMessagesByChatIds,
  getOrCreateUserByEmail,
  getStreamIdsByChatId,
  getSuggestionsByDocumentId,
  getToolConfigByUserId,
  getToolConfigsByUserId,
  getUserByClerkId,
  getUserSettings,
  pruneStreams,
  saveChat,
  saveDocument,
  saveMessages,
  saveSuggestions,
  updateCatalogSync,
  updateChatTitleById,
  updateChatVisibilityById,
  updateCustomModel,
  updateCustomProvider,
  updateDocumentContent,
  updateMessage,
  upsertToolConfig,
  upsertUserSettings,
};
