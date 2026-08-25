import { z } from "zod";
import { TOOL_IDS } from "@/lib/ai/tools/metadata";
import { ALLOWED_MEDIA_TYPES, isValidAttachmentUrl } from "@/lib/attachments";

const textPartSchema = z.object({
  text: z.string().min(1).max(40_000),
  type: z.enum(["text"]),
});

const filePartSchema = z.object({
  mediaType: z.string().refine((m) => ALLOWED_MEDIA_TYPES.includes(m), {
    message: "Unsupported attachment media type",
  }),
  name: z.string().min(1).max(100),
  type: z.enum(["file"]),
  url: z.string().refine(isValidAttachmentUrl, {
    message: "Invalid attachment URL",
  }),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

const userMessageSchema = z.object({
  id: z.uuid(),
  parts: z.array(partSchema).max(32),
  role: z.enum(["user"]),
});

const toolApprovalMessageSchema = z.object({
  id: z.string(),
  parts: z.array(z.record(z.string(), z.unknown())),
  role: z.enum(["user", "assistant"]),
});

export const postRequestBodySchema = z.object({
  enabledTools: z.array(z.enum(TOOL_IDS)).optional(),
  id: z.uuid(),
  message: userMessageSchema.optional(),
  messages: z.array(toolApprovalMessageSchema).max(32).optional(),
  reasoningEffort: z
    .enum([
      "default",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
    .optional(),
  selectedChatModel: z
    .string()
    .min(1)
    .max(200)
    .regex(
      /^([a-z0-9_-]+\/[a-z0-9._-]+|custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9._-]+)$/i,
      {
        message: "Invalid model id format",
      }
    ),
  selectedVisibilityType: z.enum(["public", "private"]),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
