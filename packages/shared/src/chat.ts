import { z } from "zod";

export const ChatMessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>;

export const ChatMessageSchema = z.object({
  content: z.string(),
  createdAt: z.string().optional(),
  id: z.string(),
  role: ChatMessageRoleSchema,
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatCreateRequestSchema = z.object({
  chatId: z.string().optional(),
  message: z.string().min(1),
  model: z.string().optional(),
});
export type ChatCreateRequest = z.infer<typeof ChatCreateRequestSchema>;

export const ChatHistoryItemSchema = z.object({
  createdAt: z.string(),
  id: z.string(),
  title: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
});
export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;
