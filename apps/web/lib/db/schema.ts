import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  clerkId: text("clerkId").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  email: varchar("email", { length: 64 }).notNull(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  image: text("image"),
  name: text("name"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable(
  "Chat",
  {
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    title: text("title").notNull(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    visibility: varchar("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("private"),
  },
  (table) => [
    index("Chat_userId_idx").on(table.userId),
    index("Chat_userId_updatedAt_idx").on(table.userId, table.updatedAt),
    index("Chat_updatedAt_idx").on(table.updatedAt),
  ]
);

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable(
  "Message_v2",
  {
    attachments: json("attachments")
      .$type<Array<{ name: string; url: string; contentType: string }>>()
      .notNull(),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    parts: json("parts").$type<Record<string, unknown>[]>().notNull(),
    role: varchar("role").notNull(),
  },
  (table) => [
    index("Message_chatId_idx").on(table.chatId),
    index("Message_chatId_createdAt_idx").on(table.chatId, table.createdAt),
  ]
);

export type DBMessage = InferSelectModel<typeof message>;

export const document = pgTable(
  "Document",
  {
    content: text("content"),
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    title: text("title").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    documentIdIdx: index("Document_id_idx").on(table.id),
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    createdAt: timestamp("createdAt").notNull(),
    description: text("description"),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    documentId: uuid("documentId").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    isResolved: boolean("isResolved").notNull().default(false),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }).onDelete("cascade"),
    pk: primaryKey({ columns: [table.id] }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").notNull().defaultRandom(),
  },
  (table) => ({
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }).onDelete("cascade"),
    pk: primaryKey({ columns: [table.id] }),
    streamChatIdCreatedAtIdx: index("Stream_chatId_createdAt_idx").on(
      table.chatId,
      table.createdAt
    ),
    streamChatIdIdx: index("Stream_chatId_idx").on(table.chatId),
    streamCreatedAtIdx: index("Stream_createdAt_idx").on(table.createdAt),
  })
);

export type Stream = InferSelectModel<typeof stream>;

export const customProvider = pgTable(
  "CustomProvider",
  {
    baseURL: varchar("baseURL", { length: 512 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    defaultConfig: json("defaultConfig").$type<ProviderDefaultConfig>(),
    encryptedApiKey: text("encryptedApiKey").notNull(),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    iv: varchar("iv", { length: 32 }).notNull(),
    keyVersion: integer("keyVersion").notNull().default(1),
    name: varchar("name", { length: 128 }).notNull(),
    providerKey: varchar("providerKey", { length: 128 }),
    salt: varchar("salt", { length: 64 }),
    type: varchar("type", { enum: ["openai", "anthropic"] }).notNull(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("CustomProvider_userId_idx").on(table.userId)]
);

export type CustomProvider = InferSelectModel<typeof customProvider>;

export type ProviderDefaultConfig = {
  models: Array<{
    modelId: string;
    name: string;
    capabilities: {
      tools: boolean;
      vision: boolean;
      reasoning: boolean;
      reasoningEfforts?: string[];
    };
    pricing?: ModelPricing;
  }>;
};

export type ModelPricing = {
  input: number | null;
  output: number | null;
  cachedInput: number | null;
  cachedOutput: number | null;
};

export const customModel = pgTable(
  "CustomModel",
  {
    cachedInput: doublePrecision("cachedInput"),
    cachedOutput: doublePrecision("cachedOutput"),
    capabilities: json("capabilities")
      .$type<{
        tools: boolean;
        vision: boolean;
        reasoning: boolean;
        reasoningEfforts?: string[];
      }>()
      .notNull(),
    capabilitiesIsCustom: boolean("capabilitiesIsCustom")
      .notNull()
      .default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    input: doublePrecision("input"),
    modelId: varchar("modelId", { length: 256 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    nameIsCustom: boolean("nameIsCustom").notNull().default(false),
    output: doublePrecision("output"),
    pricingIsCustom: boolean("pricingIsCustom").notNull().default(false),
    providerId: uuid("providerId")
      .notNull()
      .references(() => customProvider.id, { onDelete: "cascade" }),
  },
  (table) => [index("CustomModel_providerId_idx").on(table.providerId)]
);

export type CustomModel = InferSelectModel<typeof customModel>;

export const catalogSync = pgTable("CatalogSync", {
  id: integer("id").primaryKey(),
  syncedAt: timestamp("syncedAt"),
});

export type CatalogSync = InferSelectModel<typeof catalogSync>;

export const toolConfig = pgTable(
  "ToolConfig",
  {
    baseURL: text("baseURL").notNull().default(""),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    enabled: boolean("enabled").notNull().default(false),
    encryptedApiKey: text("encryptedApiKey").notNull(),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    iv: varchar("iv", { length: 32 }).notNull(),
    keyVersion: integer("keyVersion").notNull().default(1),
    provider: varchar("provider", { length: 64 }).notNull(),
    salt: varchar("salt", { length: 64 }),
    toolId: varchar("toolId", { length: 64 }).notNull(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("ToolConfig_userId_toolId_provider_idx").on(
      table.userId,
      table.toolId,
      table.provider
    ),
  ]
);

export type ToolConfig = InferSelectModel<typeof toolConfig>;

export const userSettings = pgTable(
  "UserSettings",
  {
    aiAbout: text("aiAbout"),
    aiIncludeDate: boolean("aiIncludeDate"),
    aiIncludeLocation: boolean("aiIncludeLocation"),
    aiInstructions: text("aiInstructions"),
    aiPersonality: varchar("aiPersonality", { length: 512 }),
    aiUserName: varchar("aiUserName", { length: 128 }),
    chatModelId: varchar("chatModelId", { length: 512 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    enabledTools: json("enabledTools").$type<string[] | null>(),
    enterBehavior: varchar("enterBehavior", { length: 32 }),
    fontBody: varchar("fontBody", { length: 64 }),
    fontHeading: varchar("fontHeading", { length: 64 }),
    fontLabel: varchar("fontLabel", { length: 64 }),
    fontMath: varchar("fontMath", { length: 64 }),
    fontMono: varchar("fontMono", { length: 64 }),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    identityDisplayMode: varchar("identityDisplayMode", { length: 32 }),
    reasoningEffort: varchar("reasoningEffort", { length: 32 }),
    showConversationCost: boolean("showConversationCost"),
    sidebarCollapsed: boolean("sidebarCollapsed"),
    statsForNerds: boolean("statsForNerds"),
    theme: varchar("theme", { length: 16 }),
    titleModelId: varchar("titleModelId", { length: 512 }),
    titleReasoningEffort: varchar("titleReasoningEffort", { length: 32 }),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("UserSettings_userId_idx").on(table.userId)]
);

export type UserSettings = InferSelectModel<typeof userSettings>;
