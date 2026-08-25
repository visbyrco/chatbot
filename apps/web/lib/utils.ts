import type { UIMessage, UIMessagePart } from "ai";
import { type ClassValue, clsx } from "clsx";
import { formatISO } from "date-fns";
import { twMerge } from "tailwind-merge";
import type { DBMessage, Document } from "@/lib/db/schema";
import { ChatbotError, type ErrorCode } from "./errors";
import type {
  ChatMessage,
  ChatTools,
  CustomUIDataTypes,
  MessageMetadata,
} from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function isErrorCode(code: unknown): code is ErrorCode {
  return (
    typeof code === "string" &&
    /^(bad_request|unauthorized|forbidden|not_found|rate_limit|offline):(chat|auth|api|stream|database|history|document|suggestions|provider|tools)$/.test(
      code
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorCode(code: unknown): ErrorCode {
  if (isErrorCode(code)) {
    return code;
  }
  return "bad_request:api";
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    const data: unknown = await response.json();
    const code = isRecord(data) ? data.code : undefined;
    const cause = isRecord(data) ? data.cause : undefined;
    throw new ChatbotError(
      getErrorCode(code),
      typeof cause === "string" ? cause : undefined
    );
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      const data: unknown = await response.json();
      const code = isRecord(data) ? data.code : undefined;
      const cause = isRecord(data) ? data.cause : undefined;
      throw new ChatbotError(
        getErrorCode(code),
        typeof cause === "string" ? cause : undefined
      );
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new ChatbotError("offline:chat");
    }

    throw error;
  }
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

export function getDocumentTimestampByIndex(
  documents: Document[],
  index: number
) {
  if (!documents) {
    return new Date();
  }
  if (index > documents.length) {
    return new Date();
  }

  return documents[index].createdAt;
}

export function sanitizeText(text: string) {
  return text.replace("<has_function_call>", "");
}

function isChatRole(role: string): role is "user" | "assistant" | "system" {
  return role === "user" || role === "assistant" || role === "system";
}

function isUIMessagePart(
  part: unknown
): part is UIMessagePart<CustomUIDataTypes, ChatTools> {
  return isRecord(part) && typeof part.type === "string";
}

function isTextPart(part: unknown): part is { type: "text"; text: string } {
  return (
    isRecord(part) && part.type === "text" && typeof part.text === "string"
  );
}

export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  return messages.map((message) => {
    const role = isChatRole(message.role) ? message.role : "user";
    const rawParts = Array.isArray(message.parts) ? message.parts : [];
    const parts = rawParts.filter(isUIMessagePart);
    const rawMetadata = isRecord(message.metadata)
      ? (message.metadata as Partial<MessageMetadata>)
      : {};
    const metadata: MessageMetadata = {
      ...rawMetadata,
      createdAt: formatISO(message.createdAt),
    } as MessageMetadata;
    return {
      id: message.id,
      metadata,
      parts,
      role,
    };
  });
}

export function getTextFromMessage(message: ChatMessage | UIMessage): string {
  return message.parts
    .filter(isTextPart)
    .map((part) => {
      if ("text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("");
}
