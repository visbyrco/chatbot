import { readFile as readFsFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import { isTextMediaType, sanitizeFilename } from "@/lib/attachments";
import { getDocumentById } from "@/lib/db/queries";

const MAX_READ_LENGTH = 50_000;

function getUploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./uploads";
}

function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

function isLocalFileUrl(url: string | undefined): boolean {
  if (!url || url === "") {
    return false;
  }
  if (url.startsWith("//")) {
    return false;
  }
  try {
    const parsed = new URL(url, "http://local.invalid");
    if (parsed.origin !== "http://local.invalid") {
      return false;
    }
    const { pathname } = parsed;
    const basePath = getBasePath();
    if (pathname.startsWith("/api/files/")) {
      return true;
    }
    if (basePath && pathname.startsWith(`${basePath}/api/files/`)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function isFileOwnedByUser(
  safeName: string,
  userId: string,
  uploadDir: string
): Promise<boolean> {
  const metaPath = join(uploadDir, ".meta", `${safeName}.json`);
  try {
    const raw = await readFsFile(metaPath, "utf8");
    const meta = JSON.parse(raw) as { userId?: string };
    return meta.userId === userId;
  } catch {
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

type ReadFileProps = {
  session: Session;
};

export const readFile = ({ session }: ReadFileProps) =>
  tool({
    description:
      "Read the content of a file in this conversation. Use to inspect an artifact (by id) or an uploaded file (by url or name) before editing or answering about it. For binary files (images, pdf), this will return an error — describe them instead.",
    execute: async ({
      id,
      url,
      name,
    }: {
      id?: string;
      url?: string;
      name?: string;
    }) => {
      if (!session.user?.id) {
        return { error: "Unauthorized" };
      }

      // Priority 1: id -> try artifact
      if (id) {
        const document = await getDocumentById({ id });
        if (document) {
          if (document.userId !== session.user.id) {
            return { error: "Forbidden" };
          }
          const content = document.content ?? "";
          if (content.length > MAX_READ_LENGTH) {
            return {
              content: `${content.slice(0, MAX_READ_LENGTH)}… [truncated ${content.length - MAX_READ_LENGTH} characters]`,
              id: document.id,
              kind: document.kind,
              title: document.title,
              truncated: true,
            };
          }
          return {
            content,
            id: document.id,
            kind: document.kind,
            title: document.title,
          };
        }
        // If id looks like a safeName, fall through to upload handling
        // else artifact not found
        if (!url && !name) {
          return { error: "File not found" };
        }
      }

      // Resolve url or name to a safeName + url
      let targetUrl = url;
      const targetName = name;

      // If only name provided, search for matching file in user's messages or artifact title
      if (!targetUrl && targetName) {
        // 1) Search artifact by title via messages artifactIds
        try {
          const { getAllMessagesByUserId } = await import("@/lib/db/queries");
          const messages = await getAllMessagesByUserId({
            userId: session.user.id,
          });
          // Collect artifact ids
          const artifactIds = messages.flatMap((m) => {
            const parts = Array.isArray(m.parts) ? m.parts : [];
            return parts
              .filter(
                (p) =>
                  typeof p === "object" &&
                  p !== null &&
                  "type" in p &&
                  typeof (p as { type: unknown }).type === "string" &&
                  ((p as { type: string }).type.startsWith("tool-") ||
                    (p as { type: string }).type === "tool-createDocument" ||
                    (p as { type: string }).type === "tool-updateDocument")
              )
              .map((p) => (p as { output?: { id?: string } }).output?.id)
              .filter((v): v is string => Boolean(v));
          });
          const uniqueArtifactIds = [...new Set(artifactIds)];
          const docs = await Promise.all(
            uniqueArtifactIds.map(async (artifactId) => {
              try {
                return await getDocumentById({ id: artifactId });
              } catch {
                return null;
              }
            })
          );
          for (const doc of docs) {
            if (
              doc &&
              doc.title === targetName &&
              doc.userId === session.user.id
            ) {
              const content = doc.content ?? "";
              if (content.length > MAX_READ_LENGTH) {
                return {
                  content: `${content.slice(0, MAX_READ_LENGTH)}… [truncated ${content.length - MAX_READ_LENGTH} characters]`,
                  id: doc.id,
                  kind: doc.kind,
                  title: doc.title,
                  truncated: true,
                };
              }
              return {
                content,
                id: doc.id,
                kind: doc.kind,
                title: doc.title,
              };
            }
          }
          // 2) Search uploaded file by name
          for (const m of messages) {
            const parts = Array.isArray(m.parts) ? m.parts : [];
            for (const p of parts) {
              if (
                typeof p === "object" &&
                p !== null &&
                "type" in p &&
                (p as { type: string }).type === "file"
              ) {
                const filePart = p as {
                  name?: string;
                  filename?: string;
                  url?: string;
                  mediaType?: string;
                };
                const fileName = filePart.name ?? filePart.filename;
                if (fileName === targetName && filePart.url) {
                  targetUrl = filePart.url;
                  break;
                }
              }
            }
            if (targetUrl) {
              break;
            }
          }
        } catch {
          // ignore
        }
        if (!targetUrl) {
          return { error: `File not found: ${targetName}` };
        }
      }

      if (!targetUrl) {
        return { error: "Provide id or url/name of file to read" };
      }

      // Handle upload file read
      if (!isLocalFileUrl(targetUrl)) {
        return {
          error:
            "Only local uploaded files and artifacts can be read. Provide an artifact id or a /api/files/... url.",
        };
      }

      const safeName = sanitizeFilename(
        basename(new URL(targetUrl, "http://local.invalid").pathname)
      );
      if (!safeName) {
        return { error: "Invalid file url" };
      }

      const uploadDir = resolve(process.cwd(), getUploadDir());
      const filePath = resolve(uploadDir, safeName);
      const rel = relative(uploadDir, filePath);
      if (isAbsolute(rel) || rel.startsWith("..")) {
        return { error: "Invalid file url" };
      }

      const owned = await isFileOwnedByUser(
        safeName,
        session.user.id,
        uploadDir
      );
      if (!owned) {
        return { error: "File not found" };
      }

      // Read metadata for contentType
      let storedContentType: string | undefined;
      try {
        const metaPath = join(uploadDir, ".meta", `${safeName}.json`);
        const raw = await readFsFile(metaPath, "utf8");
        const meta = JSON.parse(raw) as { contentType?: string };
        storedContentType = meta.contentType;
      } catch {
        // fallback: infer from extension or file part
      }

      // If we have stored type and it's not text, reject
      if (
        storedContentType &&
        !isTextMediaType(storedContentType) &&
        !storedContentType.startsWith("text/")
      ) {
        return {
          error: `Binary file (${storedContentType}) cannot be read as text. Use Python or describe the file instead.`,
        };
      }

      try {
        const buffer = await readFsFile(filePath);
        // If no stored type, try to infer via content – if we can't confirm text, check via buffer encoding
        if (!storedContentType && buffer.includes(0)) {
          return {
            error:
              "Binary file cannot be read as text. Use Python or describe the file instead.",
          };
        }
        const text = buffer.toString("utf8");
        if (text.length > MAX_READ_LENGTH) {
          return {
            content: `${text.slice(0, MAX_READ_LENGTH)}… [truncated ${text.length - MAX_READ_LENGTH} characters]`,
            name: targetName ?? safeName,
            truncated: true,
            url: targetUrl,
          };
        }
        return {
          content: text,
          name: targetName ?? safeName,
          url: targetUrl,
        };
      } catch {
        return { error: "File not found" };
      }
    },
    inputSchema: z
      .object({
        id: z
          .string()
          .optional()
          .describe("ID of the artifact/file to read (Document id)"),
        name: z
          .string()
          .optional()
          .describe(
            "Filename or artifact title to read (alternative to id/url)"
          ),
        url: z
          .string()
          .optional()
          .describe("Local file URL (/api/files/...) of the uploaded file"),
      })
      .refine((data) => Boolean(data.id || data.url || data.name), {
        message: "Provide at least one of id, url, or name",
      }),
  });
