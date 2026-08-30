import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import {
  isAllowedMediaType,
  isAudioMediaType,
  isBlockedMediaType,
  isVideoMediaType,
  MAX_FILE_SIZE,
  MAX_VIDEO_AUDIO_FILE_SIZE,
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

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine(
      (file) => {
        const limit =
          isVideoMediaType(file.type) || isAudioMediaType(file.type)
            ? MAX_VIDEO_AUDIO_FILE_SIZE
            : MAX_FILE_SIZE;
        return file.size <= limit;
      },
      {
        message: "File size exceeds limit",
      }
    )
    .refine((file) => !isBlockedMediaType(file.type), {
      message: "Blocked file type",
    })
    .refine((file) => isAllowedMediaType(file.type), {
      message: "File type should be an image, PDF, text, video, or audio file",
    }),
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
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const rawExt = extname(sanitized).toLowerCase();
    const ext = ALLOWED_FILE_EXTS.has(rawExt) ? rawExt : ".bin";
    const safeName = `${randomUUID()}${ext}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    try {
      const uploadDir = resolve(process.cwd(), getUploadDir());
      await mkdir(uploadDir, { recursive: true });
      const filePath = join(uploadDir, safeName);
      await writeFile(filePath, fileBuffer);

      // Persist ownership metadata for authenticated file serving.
      try {
        const metaDir = join(uploadDir, ".meta");
        await mkdir(metaDir, { recursive: true });
        const metaPath = join(metaDir, `${safeName}.json`);
        await writeFile(
          metaPath,
          JSON.stringify({
            contentType: file.type,
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
        contentType: file.type,
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
