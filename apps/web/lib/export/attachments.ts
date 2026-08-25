import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { format } from "date-fns";
import { isLocalFileUrl, sanitizeFilename } from "@/lib/attachments";

/**
 * A `file` part as persisted inside a message's `parts` array. Attachments are
 * stored on disk under `UPLOAD_DIR` with a sanitized name; the part references
 * them via the local `/api/files/<filename>` URL.
 */
type FilePart = {
  filename?: string;
  mediaType?: string;
  name?: string;
  type: "file";
  url?: string;
};

export type AttachmentEntry = {
  chatId: string;
  chatTitle: string;
  /** The file URL, unique per upload — used as the attachment's id. */
  id: string;
  mediaType: string;
  messageCreatedAt: string;
  name: string;
  url: string;
};

export function extractFileParts(parts: unknown): FilePart[] {
  if (!Array.isArray(parts)) {
    return [];
  }

  return parts.filter(
    (part): part is FilePart =>
      typeof part === "object" &&
      part !== null &&
      (part as { type?: unknown }).type === "file"
  );
}

/**
 * Collect all distinct attachments across a user's messages. Identical URLs
 * (the same uploaded file referenced more than once) are deduplicated.
 */
export function collectAttachments(
  messages: Array<{
    chatId: string;
    chatTitle: string;
    createdAt: Date;
    parts: unknown;
  }>
): AttachmentEntry[] {
  const entries = new Map<string, AttachmentEntry>();

  for (const message of messages) {
    for (const part of extractFileParts(message.parts)) {
      const url = part.url ?? "";
      if (!url || entries.has(url)) {
        continue;
      }

      const fallbackName = url.split("/").filter(Boolean).pop() ?? "attachment";

      entries.set(url, {
        chatId: message.chatId,
        chatTitle: message.chatTitle,
        id: url,
        mediaType: part.mediaType ?? "",
        messageCreatedAt: message.createdAt.toISOString(),
        name: part.name ?? part.filename ?? fallbackName,
        url,
      });
    }
  }

  return [...entries.values()];
}

function getUploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./uploads";
}

export type LocalAttachmentReadResult =
  | { status: "external" }
  | { status: "missing" }
  | { status: "ok"; data: Buffer };

/**
 * Read an attachment's bytes from disk. Returns `external` for non-local URLs
 * (we never fetch remote resources) and `missing` when the file is no longer
 * on the server.
 */
export async function readLocalAttachment(
  url: string
): Promise<LocalAttachmentReadResult> {
  if (!isLocalFileUrl(url)) {
    return { status: "external" };
  }

  const filename = sanitizeFilename(
    basename(new URL(url, "http://local.invalid").pathname)
  );
  if (!filename) {
    return { status: "missing" };
  }

  try {
    const { resolve } = await import("node:path");
    const uploadDir = resolve(process.cwd(), getUploadDir());
    const filePath = join(uploadDir, filename);
    if (!filePath.startsWith(uploadDir)) {
      return { status: "missing" };
    }
    const data = await readFile(filePath);
    return { data, status: "ok" };
  } catch {
    return { status: "missing" };
  }
}

/**
 * Turn a chat title into a short filesystem-safe directory name used to group
 * attachments inside the export archive.
 */
export function titleToSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "chat"
  );
}

/**
 * Build a `<chat-slug>/<name>` path inside the zip, appending ` (2)`, ` (3)`,
 * etc. before the extension when the path is already taken.
 */
export function uniqueZipPath(
  chatTitle: string,
  name: string,
  used: Set<string>
): string {
  const slug = titleToSlug(chatTitle);
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const extStripped = ext.replace(/[^a-zA-Z0-9.-]/g, "");

  let candidate = `${slug}/${name}`;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${slug}/${base} (${index})${extStripped}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Build the `README.md` that ships inside the export archive, listing what was
 * included and what (if anything) could not be included and why.
 */
export function buildManifest({
  excluded,
  exportedAt,
  files,
  totalSelected,
}: {
  excluded: Array<{ name: string; reason: string; url: string }>;
  exportedAt: Date;
  files: Array<{ chatTitle: string; messageCreatedAt: string; path: string }>;
  totalSelected: number;
}): string {
  const lines = [
    "# Chatbot Attachment Export",
    "",
    `- **Exported:** ${format(exportedAt, "PPp")}`,
    `- **Files included:** ${files.length} of ${totalSelected}`,
    "",
  ];

  if (files.length > 0) {
    lines.push("## Included files", "");
    for (const file of files) {
      lines.push(
        `- \`${file.path}\` — from **${file.chatTitle}** · ${format(
          new Date(file.messageCreatedAt),
          "PPp"
        )}`
      );
    }
    lines.push("");
  }

  if (excluded.length > 0) {
    lines.push("## Not exported", "");
    for (const item of excluded) {
      lines.push(`- [${item.reason}] \`${item.name}\` — ${item.url}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
