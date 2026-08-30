// Single source of truth for extension -> media type fallback.
// Used by the upload route and client file filters when the browser sends
// an empty or generic type ("" / "application/octet-stream") for
// csv/md/yaml/xml etc. Keep in sync with ALLOWED_FILE_EXTS in the upload
// route and the `accept` list in multimodal-input.
export const EXT_TO_MEDIA_TYPE: Record<string, string> = {
  ".aac": "audio/aac",
  ".avi": "video/x-msvideo",
  ".avif": "image/avif",
  ".csv": "text/csv",
  ".flac": "audio/flac",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".m4a": "audio/mp4",
  ".md": "text/markdown",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".oga": "audio/ogg",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
};

export const IMAGE_EXTS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
  "avif",
] as const;
export const VIDEO_EXTS = [
  "mp4",
  "webm",
  "mov",
  "avi",
  "mpeg",
  "mpg",
  "ogg",
  "ogv",
] as const;
export const AUDIO_EXTS = [
  "mp3",
  "wav",
  "flac",
  "aac",
  "m4a",
  "oga",
  "ogg",
] as const;
export const TEXT_EXTS = [
  "txt",
  "md",
  "csv",
  "json",
  "xml",
  "yaml",
  "yml",
] as const;

export function normalizeMediaType(mediaType: string): string {
  if (mediaType === "image/jpg") {
    return "image/jpeg";
  }
  if (mediaType === "image/heic-sequence") {
    return "image/heic";
  }
  if (mediaType === "image/heif-sequence") {
    return "image/heif";
  }
  return mediaType;
}

export function isGenericOctetStream(mediaType: string | undefined): boolean {
  if (mediaType === undefined) {
    return false;
  }
  const lower = mediaType.trim().toLowerCase();
  if (lower === "") {
    return true;
  }
  return (
    lower.startsWith("application/octet-stream") ||
    lower.startsWith("application/x-octet-stream")
  );
}

export function getMediaTypeForExtension(ext: string): string | undefined {
  return EXT_TO_MEDIA_TYPE[ext.toLowerCase()];
}

export function inferMediaTypeFromFilename(
  filename: string,
  rawType: string | undefined
): string {
  const raw = rawType?.trim() ?? "";
  if (raw !== "" && !isGenericOctetStream(raw)) {
    return normalizeMediaType(raw);
  }
  const dot = filename.lastIndexOf(".");
  const ext = dot === -1 ? "" : filename.slice(dot).toLowerCase();
  const mapped = EXT_TO_MEDIA_TYPE[ext];
  if (mapped) {
    return mapped;
  }
  return normalizeMediaType(raw);
}

export function inferMediaTypeForFile(file: {
  type: string;
  name: string;
}): string {
  return inferMediaTypeFromFilename(file.name, file.type);
}
