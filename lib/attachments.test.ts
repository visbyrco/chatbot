import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatFileSize,
  MAX_INLINE_FILE_SIZE,
} from "@/lib/attachment-constants";
import {
  localFileUrlToDataUrl,
  localFileUrlToDataUrlWithStatus,
  resolveAttachmentParts,
} from "@/lib/attachments";
import type { ChatMessage } from "@/lib/types";

describe("formatFileSize", () => {
  it("formats bytes, KB, MB, and GB", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(35_932_256)).toBe("34.3 MB");
    expect(formatFileSize(20 * 1024 * 1024)).toBe("20 MB");
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe("3 GB");
  });

  it("handles invalid input", () => {
    expect(formatFileSize(Number.NaN)).toBe("unknown size");
    expect(formatFileSize(-1)).toBe("unknown size");
  });
});

describe("inline limit constant", () => {
  it("is 20 MB", () => {
    expect(MAX_INLINE_FILE_SIZE).toBe(20 * 1024 * 1024);
  });
});

describe("localFileUrlToDataUrlWithStatus", () => {
  let uploadDir: string;

  beforeEach(() => {
    uploadDir = mkdtempSync(join(tmpdir(), "uploads-test-"));
    mkdirSync(join(uploadDir, ".meta"), { recursive: true });
    vi.stubEnv("UPLOAD_DIR", uploadDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function writeOwnedFile(name: string, content: Buffer, userId: string) {
    writeFileSync(join(uploadDir, name), content);
    writeFileSync(
      join(uploadDir, ".meta", `${name}.json`),
      JSON.stringify({ userId })
    );
  }

  it("inlines small files", async () => {
    writeOwnedFile("small_txt.txt", Buffer.from("hello"), "user-1");
    const result = await localFileUrlToDataUrlWithStatus(
      "/api/files/small_txt.txt",
      "text/plain",
      "user-1"
    );
    expect(result.status).toBe("inline");
    if (result.status === "inline") {
      expect(result.dataUrl.startsWith("data:text/plain;base64,")).toBe(true);
    }
    // Legacy wrapper still returns the data URL.
    const legacy = await localFileUrlToDataUrl(
      "/api/files/small_txt.txt",
      "text/plain",
      "user-1"
    );
    expect(legacy?.startsWith("data:")).toBe(true);
  });

  it("reports too-large instead of unreadable", async () => {
    const big = Buffer.alloc(MAX_INLINE_FILE_SIZE + 1024, "a");
    writeOwnedFile("big_mp4.mp4", big, "user-1");
    const result = await localFileUrlToDataUrlWithStatus(
      "/api/files/big_mp4.mp4",
      "video/mp4",
      "user-1"
    );
    expect(result.status).toBe("too-large");
    if (result.status === "too-large") {
      expect(result.size).toBe(MAX_INLINE_FILE_SIZE + 1024);
    }
    // Legacy wrapper collapses too-large to null (unreadable-equivalent).
    const legacy = await localFileUrlToDataUrl(
      "/api/files/big_mp4.mp4",
      "video/mp4",
      "user-1"
    );
    expect(legacy).toBeNull();
  });

  it("reports unreadable for missing files", async () => {
    const result = await localFileUrlToDataUrlWithStatus(
      "/api/files/does-not-exist_xyz.mp4",
      "video/mp4",
      "user-1"
    );
    expect(result.status).toBe("unreadable");
  });
});

describe("resolveAttachmentParts too-large placeholder (issue #214)", () => {
  let uploadDir: string;

  beforeEach(() => {
    uploadDir = mkdtempSync(join(tmpdir(), "uploads-test-"));
    mkdirSync(join(uploadDir, ".meta"), { recursive: true });
    vi.stubEnv("UPLOAD_DIR", uploadDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function writeOwnedFile(name: string, content: Buffer, userId: string) {
    writeFileSync(join(uploadDir, name), content);
    writeFileSync(
      join(uploadDir, ".meta", `${name}.json`),
      JSON.stringify({ userId })
    );
  }

  function userMessageWithFile(name: string, mediaType: string): ChatMessage[] {
    return [
      {
        id: "msg-1",
        metadata: {},
        parts: [
          {
            mediaType,
            name,
            type: "file",
            url: `/api/files/${name}`,
          },
        ],
        role: "user",
      } as unknown as ChatMessage,
    ];
  }

  it("emits an explicit too-large note, not [unreadable]", async () => {
    const size = MAX_INLINE_FILE_SIZE + 512;
    writeOwnedFile("clip_mp4.mp4", Buffer.alloc(size, "b"), "user-1");
    const resolved = await resolveAttachmentParts(
      userMessageWithFile("clip_mp4.mp4", "video/mp4"),
      "user-1"
    );
    const part = resolved[0]?.parts[0] as { text?: string; type?: string };
    expect(part.type).toBe("text");
    expect(part.text).toContain("too large to send to model");
    expect(part.text).not.toContain("[unreadable]");
    expect(part.text).toContain(formatFileSize(size));
    expect(part.text).toContain(formatFileSize(MAX_INLINE_FILE_SIZE));
  });

  it("keeps [unreadable] for genuinely missing files", async () => {
    const resolved = await resolveAttachmentParts(
      userMessageWithFile("missing_mp4.mp4", "video/mp4"),
      "user-1"
    );
    const part = resolved[0]?.parts[0] as { text?: string; type?: string };
    expect(part.type).toBe("text");
    expect(part.text).toContain("[unreadable]");
  });
});
