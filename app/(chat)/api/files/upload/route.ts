import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import {
  EXT_TO_MEDIA_TYPE,
  isGenericOctetStream,
} from "@/lib/attachment-constants";
import {
  isAllowedMediaType,
  isAudioMediaType,
  isBlockedMediaType,
  isVideoMediaType,
  MAX_FILE_SIZE,
  MAX_VIDEO_AUDIO_FILE_SIZE,
  normalizeMediaType,
} from "@/lib/attachments";
import { ChatbotError } from "@/lib/errors";
import { checkUploadRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/server/request-utils";

function getUploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./uploads";
}

const ALLOWED_FILE_EXTS = new Set([
  ".csv",
  ".gif",
  ".heic",
  ".heif",
  ".avif",
  ".jpeg",
  ".jpg",
  ".json",
  ".md",
  ".pdf",
  ".png",
  ".txt",
  ".webp",
  ".xml",
  ".yaml",
  ".yml",
  // video
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mpeg",
  ".mpg",
  ".ogg",
  ".ogv",
  // audio
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
  ".oga",
]);

function inferMediaType(file: Blob, filename: string): string {
  const raw = (file as File).type?.trim() ?? "";
  if (raw !== "" && !isGenericOctetStream(raw)) {
    return normalizeMediaType(raw);
  }
  const ext = extname(filename).toLowerCase();
  const mapped = EXT_TO_MEDIA_TYPE[ext];
  if (mapped) {
    return mapped;
  }
  return normalizeMediaType(raw);
}

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine(
      (file) => {
        const name = (file as File).name ?? "";
        const mediaType = inferMediaType(file, name);
        const limit =
          isVideoMediaType(mediaType) || isAudioMediaType(mediaType)
            ? MAX_VIDEO_AUDIO_FILE_SIZE
            : MAX_FILE_SIZE;
        return file.size <= limit;
      },
      {
        message: "File size exceeds limit",
      }
    )
    .refine(
      (file) => {
        const name = (file as File).name ?? "";
        const mediaType = inferMediaType(file, name);
        return !isBlockedMediaType(mediaType);
      },
      {
        message: "Blocked file type",
      }
    )
    .refine(
      (file) => {
        const name = (file as File).name ?? "";
        const mediaType = inferMediaType(file, name);
        return isAllowedMediaType(mediaType);
      },
      {
        message:
          "File type should be an image, PDF, text, video, or audio file",
      }
    ),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await checkUploadRateLimit(getClientIp(request), session.user.id);
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    throw error;
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.issues
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const filename = (formData.get("file") as File).name;
    const inferredType = inferMediaType(file as File, filename);
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const rawExt = extname(sanitized).toLowerCase();
    const ext = ALLOWED_FILE_EXTS.has(rawExt) ? rawExt : ".bin";
    const safeName = `${randomUUID()}${ext}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    try {
      const uploadDir = resolve(process.cwd(), getUploadDir());
      await mkdir(uploadDir, { recursive: true });
      const filePath = resolve(uploadDir, safeName);
      const rel = relative(uploadDir, filePath);
      if (isAbsolute(rel) || rel.startsWith("..")) {
        return NextResponse.json(
          { error: "Invalid filename" },
          { status: 400 }
        );
      }
      await writeFile(filePath, fileBuffer);

      // Persist ownership metadata for authenticated file serving.
      try {
        const metaDir = join(uploadDir, ".meta");
        await mkdir(metaDir, { recursive: true });
        const metaPath = join(metaDir, `${safeName}.json`);
        await writeFile(
          metaPath,
          JSON.stringify({
            contentType: inferredType,
            createdAt: new Date().toISOString(),
            originalName: filename.slice(0, 100),
            safeName,
            size: fileBuffer.length,
            userId: session.user.id,
          })
        );
      } catch {
        // Ownership metadata is best-effort; file is already stored.
        // GET will deny access if metadata is missing, so log but don't fail.
        console.error("Failed to write file metadata", { safeName });
      }

      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      return NextResponse.json({
        contentType: inferredType,
        name: filename.slice(0, 100),
        pathname: safeName,
        size: fileBuffer.length,
        url: `${basePath}/api/files/${safeName}`,
      });
    } catch {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
