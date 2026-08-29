import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { isBlockedMediaType } from "@/lib/attachments";
import { ChatbotError } from "@/lib/errors";
import { checkFilesGetRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/server/request-utils";

function getUploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./uploads";
}

// Only safe types are served with their native Content-Type.
// Dangerous types (html/js/xml/svg) are forced to a safe type and served as attachment.
const CONTENT_TYPES: Record<string, string> = {
  aac: "audio/aac",
  avi: "video/x-msvideo",
  csv: "text/csv",
  flac: "audio/flac",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  m4a: "audio/mp4",
  md: "text/markdown",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  ogv: "video/ogg",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  yaml: "application/yaml",
  yml: "application/yaml",
};

const DANGEROUS_EXTS = new Set([
  "html",
  "htm",
  "js",
  "ts",
  "xml",
  "xhtml",
  "svg",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await checkFilesGetRateLimit(getClientIp(_request), session.user.id);
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    throw error;
  }

  const { filename } = await params;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Block access to metadata sidecars and empty names
  if (!safeName || safeName.endsWith(".meta.json")) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const uploadDir = resolve(process.cwd(), getUploadDir());
  const filePath = resolve(uploadDir, safeName);

  // Prevent path traversal: filePath must stay inside uploadDir (hardened via relative)
  const rel = relative(uploadDir, filePath);
  if (isAbsolute(rel) || rel.startsWith("..")) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Ownership check via sidecar metadata
  const metaPath = join(uploadDir, ".meta", `${safeName}.json`);
  let isOwner = false;
  let storedContentType: string | undefined;
  try {
    const metaRaw = await readFile(metaPath, "utf8");
    const meta = JSON.parse(metaRaw) as {
      userId?: string;
      contentType?: string;
    };
    storedContentType = meta.contentType;
    if (meta.userId && meta.userId === session.user.id) {
      isOwner = true;
    } else {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  } catch {
    // No metadata -> fall back to message-ownership check for legacy files
    try {
      const { getAllMessagesByUserId } = await import("@/lib/db/queries");
      const messages = await getAllMessagesByUserId({
        userId: session.user.id,
      });
      const owned = messages.some((m) => {
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
      if (owned) {
        isOwner = true;
      }
    } catch {
      // ignore, will handle missing .meta below
    }
  }

  if (!isOwner) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const data = await readFile(filePath);
    const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
    const isDangerous =
      DANGEROUS_EXTS.has(ext) || isBlockedMediaType(storedContentType);
    const contentType = isDangerous
      ? "text/plain; charset=utf-8"
      : (CONTENT_TYPES[ext] ?? "application/octet-stream");

    const headers: Record<string, string> = {
      "Cache-Control": "private, no-store",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    };

    if (isDangerous) {
      headers["Content-Disposition"] = `attachment; filename="${safeName}"`;
    }

    return new Response(data, { headers });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
