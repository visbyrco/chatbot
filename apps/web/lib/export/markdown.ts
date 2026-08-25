import { format } from "date-fns";
import type { Chat, DBMessage } from "@/lib/db/schema";
import { sanitizeText } from "@/lib/utils";

/**
 * Loose shape of a message part as persisted in the DB. Parts are stored as
 * JSON and can be any of the AI SDK's UI part types (text, reasoning, file,
 * tool-*). We only read the fields we know about and ignore the rest.
 */
type ExportPart = {
  filename?: string;
  input?: Record<string, unknown>;
  mediaType?: string;
  name?: string;
  output?: Record<string, unknown> | null;
  state?: string;
  text?: string;
  type: string;
  url?: string;
};

const ROLE_LABELS: Record<string, string> = {
  assistant: "Assistant",
  system: "System",
  user: "You",
};

function formatTimestamp(date: Date | string): string {
  return format(new Date(date), "PPp");
}

function renderFilePart(part: ExportPart): string {
  const name = part.name ?? part.filename ?? "attachment";
  const { url } = part;

  if (!url) {
    return `*Attachment: ${name}*`;
  }

  const isImage = part.mediaType?.startsWith("image/") === true;
  return isImage ? `![${name}](${url})` : `[${name}](${url})`;
}

function renderReasoningPart(part: ExportPart): string {
  const text = (part.text ?? "").trim();
  if (!text) {
    return "";
  }

  const quoted = text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  return `**Reasoning**\n\n${quoted}`;
}

function renderWeatherPart(part: ExportPart): string {
  const { output } = part;
  if (!output || "error" in output) {
    return "*Weather lookup returned no result.*";
  }

  const city = typeof output.cityName === "string" ? output.cityName : "";
  const current = output.current as { temperature_2m?: unknown } | undefined;
  const temperature =
    typeof current?.temperature_2m === "number"
      ? current.temperature_2m
      : undefined;

  const location = city ? ` in ${city}` : "";
  const temp = temperature === undefined ? "" : `: ${temperature}°C`;

  return `**Weather**${location}${temp}`;
}

function renderDocumentToolPart(
  part: ExportPart,
  action: "Created" | "Updated"
): string {
  const { output } = part;
  if (!output) {
    return "";
  }

  if ("error" in output) {
    return `**${action === "Created" ? "Creating" : "Updating"} document failed:** ${String(
      output.error
    )}`;
  }

  const title = typeof output.title === "string" ? output.title : "Untitled";
  const kind = typeof output.kind === "string" ? output.kind : "document";

  return `**${action} ${kind}: ${title}**`;
}

function renderFetchUrlPart(part: ExportPart): string {
  const { output } = part;
  if (!output || "error" in output) {
    return "*Failed to fetch URL.*";
  }

  const url = typeof output.url === "string" ? output.url : "";
  const title = typeof output.title === "string" ? output.title : "";
  const content = typeof output.content === "string" ? output.content : "";

  const heading = `**Fetched${title ? `: ${title}` : ""}**`;
  const link = url ? `Source: ${url}` : "";
  const excerpt = content
    ? `\n\n${content.slice(0, 2000)}${content.length > 2000 ? "…" : ""}`
    : "";

  return [heading, link, excerpt].filter(Boolean).join("\n");
}

function renderToolPart(part: ExportPart): string {
  switch (part.type) {
    case "tool-getWeather":
      return renderWeatherPart(part);
    case "tool-createDocument":
      return renderDocumentToolPart(part, "Created");
    case "tool-updateDocument":
      return renderDocumentToolPart(part, "Updated");
    case "tool-fetchUrl":
      return renderFetchUrlPart(part);
    default:
      // Suggestions and any other tool parts are not useful in a plain
      // markdown export.
      return "";
  }
}

function renderPart(part: ExportPart): string {
  switch (part.type) {
    case "text":
      return sanitizeText(part.text ?? "");
    case "reasoning":
      return renderReasoningPart(part);
    case "file":
      return renderFilePart(part);
    default:
      return part.type.startsWith("tool-") ? renderToolPart(part) : "";
  }
}

function renderMessageParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  return (parts as ExportPart[])
    .map((part) => renderPart(part).trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Convert a chat and its messages into a single human-readable markdown
 * document. The result is intended to be opened in any markdown viewer.
 */
export function chatToMarkdown(chat: Chat, messages: DBMessage[]): string {
  const sections: string[] = [
    `# ${chat.title}`,
    "",
    `- **Exported:** ${formatTimestamp(new Date())}`,
    `- **Created:** ${formatTimestamp(chat.createdAt)}`,
    `- **Messages:** ${messages.length}`,
    "",
  ];

  for (const message of messages) {
    const role = ROLE_LABELS[message.role] ?? message.role;
    const content = renderMessageParts(message.parts);

    sections.push("---", "");
    sections.push(`## ${role} — ${formatTimestamp(message.createdAt)}`, "");

    if (content) {
      sections.push(content, "");
    }
  }

  return `${sections.join("\n").trimEnd()}\n`;
}

/**
 * Derive a filesystem-safe `.md` filename from a chat title, falling back to
 * the chat id when the title is empty or produces no usable slug.
 */
export function chatToFilename(chat: Chat): string {
  const slug = chat.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${slug || chat.id}.md`;
}
