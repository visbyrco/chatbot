import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type { ChatMessage } from "@/lib/types";

// ---------------------------------------------------------------------------
// Allowlist — single source of truth for accepted attachment media types.
// Shared by the upload route, the chat request schema, and the server-side
// resolver so they can never drift apart.
// ---------------------------------------------------------------------------

export const IMAGE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const PDF_MEDIA_TYPE = "application/pdf" as const;

export const TEXT_MEDIA_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "text/yaml",
  "text/x-yaml",
  "application/yaml",
  "application/x-yaml",
] as const;

export const VIDEO_MEDIA_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/mpeg",
  "video/ogg",
] as const;

export const AUDIO_MEDIA_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
  "audio/x-m4a",
  "audio/x-aac",
] as const;

export const BLOCKED_MEDIA_TYPES: readonly string[] = [
  "text/html",
  "text/javascript",
  "application/javascript",
  "application/xhtml+xml",
  "text/css",
  "image/svg+xml",
  "text/x-shellscript",
  "text/x-typescript",
  "text/typescript",
] as const;

export const ALLOWED_MEDIA_TYPES: readonly string[] = [
  ...IMAGE_MEDIA_TYPES,
  PDF_MEDIA_TYPE,
  ...TEXT_MEDIA_TYPES,
  ...VIDEO_MEDIA_TYPES,
  ...AUDIO_MEDIA_TYPES,
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB default for images/PDF/text
export const MAX_VIDEO_AUDIO_FILE_SIZE = 50 * 1024 * 1024; // 50 MB for video/audio only

export function isBlockedMediaType(mediaType: string | undefined): boolean {
  return (
    mediaType !== undefined &&
    (BLOCKED_MEDIA_TYPES as readonly string[]).includes(mediaType)
  );
}

export function isImageMediaType(mediaType: string | undefined): boolean {
  return (
    mediaType !== undefined &&
    IMAGE_MEDIA_TYPES.includes(mediaType as (typeof IMAGE_MEDIA_TYPES)[number])
  );
}

export function isPdfMediaType(mediaType: string | undefined): boolean {
  return mediaType === PDF_MEDIA_TYPE;
}

export function isTextMediaType(mediaType: string | undefined): boolean {
  return (
    mediaType !== undefined &&
    TEXT_MEDIA_TYPES.includes(mediaType as (typeof TEXT_MEDIA_TYPES)[number])
  );
}

export function isVideoMediaType(mediaType: string | undefined): boolean {
  return (
    mediaType !== undefined &&
    VIDEO_MEDIA_TYPES.includes(mediaType as (typeof VIDEO_MEDIA_TYPES)[number])
  );
}

export function isAudioMediaType(mediaType: string | undefined): boolean {
  return (
    mediaType !== undefined &&
    AUDIO_MEDIA_TYPES.includes(mediaType as (typeof AUDIO_MEDIA_TYPES)[number])
  );
}

export function isAllowedMediaType(mediaType: string | undefined): boolean {
  return (
    !isBlockedMediaType(mediaType) &&
    (isImageMediaType(mediaType) ||
      isPdfMediaType(mediaType) ||
      isTextMediaType(mediaType) ||
      isVideoMediaType(mediaType) ||
      isAudioMediaType(mediaType))
  );
}

// ---------------------------------------------------------------------------
// Server-side resolver
// ---------------------------------------------------------------------------

function getUploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./uploads";
}

function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

/**
 * Returns true when `url` points at this app's own file-serving route
 * (`/api/files/<filename>`), regardless of host or port and regardless of the
 * optional `basePath` prefix. We resolve only self-hosted uploads (never
 * arbitrary external URLs) to data URLs.
 *
 * Relative URLs (`/api/files/x`) are always considered local. Absolute URLs
 * are only considered local if their hostname is localhost/127.0.0.1 or matches
 * NEXT_PUBLIC_APP_URL — this handles legacy absolute URLs like
 * `https://localhost:3000/api/files/...` without opening `https://attacker.com/api/files/...`
 * to misclassification.
 */
export function isLocalFileUrl(url: string | undefined): boolean {
  if (url === undefined || url === "") {
    return false;
  }
  if (url.startsWith("//")) {
    return false;
  }
  if (url.startsWith("data:")) {
    return false;
  }
  try {
    const parsed = new URL(url, "http://local.invalid");
    const { origin, pathname } = parsed;
    const isRelative = origin === "http://local.invalid";
    const basePath = getBasePath();
    const isFilePath =
      pathname.startsWith("/api/files/") ||
      (basePath !== "" && pathname.startsWith(`${basePath}/api/files/`));
    if (!isFilePath) {
      return false;
    }
    if (isRelative) {
      return true;
    }
    // Absolute URL — only allow localhost / app host to avoid attacker.com/api/files/ misclassification
    let allowedHosts: string[] = ["localhost", "127.0.0.1"];
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (appUrl) {
        allowedHosts = [...allowedHosts, new URL(appUrl).hostname];
      }
    } catch {
      // ignore invalid NEXT_PUBLIC_APP_URL
    }
    return allowedHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Validates an attachment URL on the wire: either a local `/api/files/...`
 * path (with or without `basePath`) or an absolute `http(s)` URL. Relative
 * paths are rejected so they can never reach the AI SDK's `new URL()` call
 * during model-message conversion.
 */
export function isValidAttachmentUrl(url: string): boolean {
  if (isLocalFileUrl(url)) {
    return true;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/**
 * Turn a `/api/files/<filename>` URL into a `data:<mediaType>;base64,...` URL
 * by reading the file from `UPLOAD_DIR`. Returns `null` when the URL is not a
 * local file URL or the file can't be read.
 *
 * `mediaType` is required because the AI SDK derives the part's media type from
 * the data URL itself (`splitDataUrl`), not from the file part's `mediaType`
 * field — so a placeholder like `application/octet-stream` would reach the
 * provider and cause it to reject or mishandle the attachment.
 */
export async function localFileUrlToDataUrl(
  url: string | undefined,
  mediaType: string,
  ownerUserId: string
): Promise<string | null> {
  if (!isLocalFileUrl(url)) {
    return null;
  }

  const filename = sanitizeFilename(
    basename(new URL(url as string, "http://local.invalid").pathname)
  );
  if (!filename) {
    return null;
  }

  try {
    const { resolve, relative, isAbsolute } = await import("node:path");
    const { cwd } = await import("node:process");
    const uploadDir = resolve(cwd(), getUploadDir());
    const filePath = resolve(uploadDir, filename);
    const rel = relative(uploadDir, filePath);
    if (isAbsolute(rel) || rel.startsWith("..")) {
      return null;
    }
    // Ownership check — required to prevent cross-user read.
    const owned = await isFileOwnedByUser(filename, ownerUserId, uploadDir);
    if (!owned) {
      console.warn("Blocked cross-user file read attempt:", {
        filename,
        ownerUserId,
      });
      return null;
    }
    const buffer = await readFile(filePath);
    // Guard against OOM: 50 MB video → ~66 MB base64 string, times concurrent parts
    // Keep inline limit at ~20 MB raw; larger files get text placeholder.
    if (buffer.length > 20 * 1024 * 1024) {
      console.warn("Attachment too large to inline, returning placeholder:", {
        filename,
        size: buffer.length,
      });
      return null;
    }
    return `data:${mediaType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error("Failed to read attachment file:", { error, filename });
    return null;
  }
}

async function isFileOwnedByUser(
  safeName: string,
  userId: string,
  uploadDir: string
): Promise<boolean> {
  const { join } = await import("node:path");
  const metaPath = join(uploadDir, ".meta", `${safeName}.json`);
  try {
    const raw = await readFile(metaPath, "utf8");
    const meta = JSON.parse(raw) as { userId?: string };
    return meta.userId === userId;
  } catch {
    // Fallback: legacy files without sidecar — check DB message ownership.
    try {
      const { getAllMessagesByUserId } = await import("@/lib/db/queries");
      const messages = await getAllMessagesByUserId({ userId });
      return messages.some((m) => {
        const parts = m.parts as unknown[];
        if (!Array.isArray(parts)) {
          return false;
        }
        return parts.some((p) => {
          if (typeof p !== "object" || p === null) {
            return false;
          }
          const { url } = p as { url?: unknown };
          if (typeof url !== "string") {
            return false;
          }
          try {
            const base = basename(new URL(url, "http://local").pathname);
            return base === safeName;
          } catch {
            return false;
          }
        });
      });
    } catch {
      return false;
    }
  }
}

/**
 * Sanitize a filename to match the upload route's `safeName` rules, so we read
 * exactly what was written (defensive against path traversal).
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

type FilePart = {
  type: "file";
  mediaType: string;
  name?: string;
  filename?: string;
  url?: string;
};

/**
 * Resolve file parts whose `url` points at the local `/api/files/` route:
 *
 * - **Image / PDF parts:** rewrite `url` to a `data:` URL so the bytes are
 *   inlined and shipped directly to the provider. The provider's API servers
 *   can't reach `http://localhost:3000`, and the AI SDK skips downloading any
 *   `http(s)://` URL for `@ai-sdk/openai` / `@ai-sdk/anthropic` (they declare
 *   it "supported"), so the image would otherwise be silently dropped.
 * - **Text-like files:** replace the `file` part with an inline `text` part
 *   containing the file content, so any model — vision or not — can read it.
 *
 * Non-local URLs and read failures are left untouched so the request still
 * works (the model just may not see that attachment). The DB is unaffected —
 * this transform runs only on the in-memory messages sent to the model.
 */
export async function resolveAttachmentParts(
  messages: ChatMessage[],
  ownerUserId: string
): Promise<ChatMessage[]> {
  return await Promise.all(
    messages.map(async (message) => {
      if (message.role !== "user") {
        return message;
      }

      const resolvedParts = await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "file") {
            return part;
          }

          const filePart = part as FilePart;
          if (!isLocalFileUrl(filePart.url)) {
            return part;
          }

          const dataUrl = await localFileUrlToDataUrl(
            filePart.url,
            filePart.mediaType,
            ownerUserId
          );
          if (dataUrl === null) {
            // Local file couldn't be read (e.g. deleted since upload). Don't
            // forward a bare relative URL to the model — the AI SDK would
            // throw on `new URL(relative)`. Send an inline note instead.
            return {
              text: `<attachment name="${filePart.name ?? filePart.filename ?? "file"}">[unreadable]</attachment>`,
              type: "text" as const,
            };
          }

          // Text-like files → inline text part (works on every model).
          if (isTextMediaType(filePart.mediaType)) {
            const decoded = dataUrlToText(dataUrl);
            if (decoded !== null) {
              return {
                text: `<attachment name="${filePart.name ?? filePart.filename ?? "file"}">\n${decoded}\n</attachment>`,
                type: "text" as const,
              };
            }
          }

          // Images / PDFs / video / audio → keep as a file part with an
          // inlined data URL. The model receives the bytes inline; the provider
          // cannot fetch localhost http(s) URLs and the AI SDK skips external
          // download for openai/anthropic, so inlining is required.
          // Ensure the FileUIPart uses `filename` (AI SDK type) in addition to
          // legacy `name` so convertToModelMessages preserves it.
          return {
            ...filePart,
            filename: filePart.filename ?? filePart.name,
            url: dataUrl,
          };
        })
      );

      return { ...message, parts: resolvedParts };
    })
  );
}

function dataUrlToText(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) {
    return null;
  }
  const base64 = dataUrl.slice(comma + 1);
  try {
    return Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return null;
  }
}
