import "server-only";

import { isTestEnvironmentNow } from "@/lib/constants";
import { inMemoryQueries } from "./in-memory";
import {
  createCustomModel as pgCreateCustomModel,
  createCustomModels as pgCreateCustomModels,
  createCustomProvider as pgCreateCustomProvider,
  createStreamId as pgCreateStreamId,
  createUserFromClerk as pgCreateUserFromClerk,
  deleteAllChatsByUserId as pgDeleteAllChatsByUserId,
  deleteChatById as pgDeleteChatById,
  deleteCustomModel as pgDeleteCustomModel,
  deleteCustomProvider as pgDeleteCustomProvider,
  deleteDocumentsByIdAfterTimestamp as pgDeleteDocumentsByIdAfterTimestamp,
  deleteMessagesByChatIdAfterTimestamp as pgDeleteMessagesByChatIdAfterTimestamp,
  deleteToolConfig as pgDeleteToolConfig,
  getAllChatsByUserId as pgGetAllChatsByUserId,
  getAllMessagesByUserId as pgGetAllMessagesByUserId,
  getCatalogSync as pgGetCatalogSync,
  getChatById as pgGetChatById,
  getChatsByIds as pgGetChatsByIds,
  getChatsByUserId as pgGetChatsByUserId,
  getCustomModelsByProviderId as pgGetCustomModelsByProviderId,
  getCustomModelsByProviderIds as pgGetCustomModelsByProviderIds,
  getCustomModelsForUser as pgGetCustomModelsForUser,
  getCustomProviderById as pgGetCustomProviderById,
  getCustomProviderByModelId as pgGetCustomProviderByModelId,
  getCustomProvidersByUserId as pgGetCustomProvidersByUserId,
  getDecryptedApiKey as pgGetDecryptedApiKey,
  getDocumentById as pgGetDocumentById,
  getDocumentsById as pgGetDocumentsById,
  getMessageById as pgGetMessageById,
  getMessageCountByUserId as pgGetMessageCountByUserId,
  getMessagesByChatId as pgGetMessagesByChatId,
  getMessagesByChatIds as pgGetMessagesByChatIds,
  getOrCreateUserByEmail as pgGetOrCreateUserByEmail,
  getStreamIdsByChatId as pgGetStreamIdsByChatId,
  getSuggestionsByDocumentId as pgGetSuggestionsByDocumentId,
  getToolConfigByUserId as pgGetToolConfigByUserId,
  getToolConfigsByUserId as pgGetToolConfigsByUserId,
  getUserByClerkId as pgGetUserByClerkId,
  getUserSettings as pgGetUserSettings,
  pruneStreams as pgPruneStreams,
  saveChat as pgSaveChat,
  saveDocument as pgSaveDocument,
  saveMessages as pgSaveMessages,
  saveSuggestions as pgSaveSuggestions,
  updateCatalogSync as pgUpdateCatalogSync,
  updateChatTitleById as pgUpdateChatTitleById,
  updateChatVisibilityById as pgUpdateChatVisibilityById,
  updateCustomModel as pgUpdateCustomModel,
  updateCustomProvider as pgUpdateCustomProvider,
  updateDocumentContent as pgUpdateDocumentContent,
  updateMessage as pgUpdateMessage,
  upsertToolConfig as pgUpsertToolConfig,
  upsertUserSettings as pgUpsertUserSettings,
} from "./queries.pg";

const pgQueries = {
  createCustomModel: pgCreateCustomModel,
  createCustomModels: pgCreateCustomModels,
  createCustomProvider: pgCreateCustomProvider,
  createStreamId: pgCreateStreamId,
  createUserFromClerk: pgCreateUserFromClerk,
  deleteAllChatsByUserId: pgDeleteAllChatsByUserId,
  deleteChatById: pgDeleteChatById,
  deleteCustomModel: pgDeleteCustomModel,
  deleteCustomProvider: pgDeleteCustomProvider,
  deleteDocumentsByIdAfterTimestamp: pgDeleteDocumentsByIdAfterTimestamp,
  deleteMessagesByChatIdAfterTimestamp: pgDeleteMessagesByChatIdAfterTimestamp,
  deleteToolConfig: pgDeleteToolConfig,
  getAllChatsByUserId: pgGetAllChatsByUserId,
  getAllMessagesByUserId: pgGetAllMessagesByUserId,
  getCatalogSync: pgGetCatalogSync,
  getChatById: pgGetChatById,
  getChatsByIds: pgGetChatsByIds,
  getChatsByUserId: pgGetChatsByUserId,
  getCustomModelsByProviderId: pgGetCustomModelsByProviderId,
  getCustomModelsByProviderIds: pgGetCustomModelsByProviderIds,
  getCustomModelsForUser: pgGetCustomModelsForUser,
  getCustomProviderById: pgGetCustomProviderById,
  getCustomProviderByModelId: pgGetCustomProviderByModelId,
  getCustomProvidersByUserId: pgGetCustomProvidersByUserId,
  getDecryptedApiKey: pgGetDecryptedApiKey,
  getDocumentById: pgGetDocumentById,
  getDocumentsById: pgGetDocumentsById,
  getMessageById: pgGetMessageById,
  getMessageCountByUserId: pgGetMessageCountByUserId,
  getMessagesByChatId: pgGetMessagesByChatId,
  getMessagesByChatIds: pgGetMessagesByChatIds,
  getOrCreateUserByEmail: pgGetOrCreateUserByEmail,
  getStreamIdsByChatId: pgGetStreamIdsByChatId,
  getSuggestionsByDocumentId: pgGetSuggestionsByDocumentId,
  getToolConfigByUserId: pgGetToolConfigByUserId,
  getToolConfigsByUserId: pgGetToolConfigsByUserId,
  getUserByClerkId: pgGetUserByClerkId,
  getUserSettings: pgGetUserSettings,
  pruneStreams: pgPruneStreams,
  saveChat: pgSaveChat,
  saveDocument: pgSaveDocument,
  saveMessages: pgSaveMessages,
  saveSuggestions: pgSaveSuggestions,
  updateCatalogSync: pgUpdateCatalogSync,
  updateChatTitleById: pgUpdateChatTitleById,
  updateChatVisibilityById: pgUpdateChatVisibilityById,
  updateCustomModel: pgUpdateCustomModel,
  updateCustomProvider: pgUpdateCustomProvider,
  updateDocumentContent: pgUpdateDocumentContent,
  updateMessage: pgUpdateMessage,
  upsertToolConfig: pgUpsertToolConfig,
  upsertUserSettings: pgUpsertUserSettings,
};

type Queries = typeof pgQueries;

const memQueries = inMemoryQueries as unknown as Queries satisfies Queries;

// Evaluate at call time so a Docker Hub image built without DEMO_MODE still
// honors DEMO_MODE=1 set at `docker run` time. The static export above was
// frozen at build-time and broke demo after Hub pull.
function isClerkConfigured(): boolean {
  return (
    Boolean(process.env["CLERK_SECRET_KEY"]) &&
    Boolean(process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"])
  );
}

function getImpl(): Queries {
  // Fall back to in-memory when Clerk isn't configured, when no DB is
  // configured, or in demo/test — so Vercel preview without POSTGRES_URL
  // (even with Clerk keys) stays usable instead of 500 from pg connection.
  if (
    isTestEnvironmentNow() ||
    !isClerkConfigured() ||
    !process.env["POSTGRES_URL"] ||
    process.env["VERCEL_ENV"] === "preview"
  ) {
    return memQueries;
  }
  return pgQueries;
}

const queriesProxy = new Proxy({} as Queries, {
  get(_target, prop: string | symbol) {
    const impl = getImpl();
    const value = (impl as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return (...args: unknown[]) =>
        (value as (...a: unknown[]) => unknown)(...args);
    }
    return value;
  },
});

export const {
  createCustomModel,
  createCustomModels,
  createCustomProvider,
  createStreamId,
  createUserFromClerk,
  pruneStreams,
  deleteAllChatsByUserId,
  deleteChatById,
  deleteCustomModel,
  deleteCustomProvider,
  deleteDocumentsByIdAfterTimestamp,
  deleteMessagesByChatIdAfterTimestamp,
  getAllChatsByUserId,
  getAllMessagesByUserId,
  getChatById,
  getChatsByIds,
  getChatsByUserId,
  getCatalogSync,
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
  saveChat,
  saveDocument,
  saveMessages,
  saveSuggestions,
  updateChatTitleById,
  updateChatVisibilityById,
  updateCatalogSync,
  updateCustomModel,
  updateCustomProvider,
  updateDocumentContent,
  updateMessage,
  deleteToolConfig,
  upsertToolConfig,
  upsertUserSettings,
} = queriesProxy;
