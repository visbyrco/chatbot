// Pure, dependency-free helpers for surfacing AI provider errors to users.
// This module has no imports, so it is safe to use from server routes,
// shared lib code, and client components alike.

const MAX_DEPTH = 4;
const MAX_BODY_PARSE_LENGTH = 20_000;
const MAX_MESSAGE_LENGTH = 500;

const GENERIC_WRAPPER_PATTERN =
  /^AI_APICallError:|^API call failed with status/i;
const ABORT_PATTERN =
  /\b(aborted|aborterror)\b|signal aborted|cancell?ed by user|request (was )?cancell?ed\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function redactSecrets(message: string): string {
  return message
    .replace(/(sk-[A-Za-z0-9-_]{4})[A-Za-z0-9-_]+/g, "$1…")
    .replace(/(api[_-]?key\s*[:=]\s*['"]?)[^'"\s,}]+/gi, "$1[redacted]")
    .replace(/(x-api-key\s*[:=]\s*['"]?)[^'"\s,}]+/gi, "$1[redacted]")
    .replace(/\b(xai-[A-Za-z0-9-_]+|AIza[A-Za-z0-9-_]{20,})\b/g, "[redacted]")
    .replace(/\b(org-[A-Za-z0-9]{10,})\b/g, "org-[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/g, "Bearer [redacted]");
}

export function truncateMessage(
  message: string,
  maxLength: number = MAX_MESSAGE_LENGTH
): string {
  const trimmed = message.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function extractNested(
  record: Record<string, unknown>,
  keys: string[],
  depth: number
): string | null {
  for (const key of keys) {
    const nested = record[key];
    if (typeof nested === "string" || isRecord(nested)) {
      const found = extractProviderDetail(nested, depth + 1);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function extractProviderDetail(
  error: unknown,
  depth = 0
): string | null {
  // The depth bound also guards against cyclic error graphs.
  if (depth > MAX_DEPTH || error === null || error === undefined) {
    return null;
  }

  if (typeof error === "string") {
    const trimmed = error.trim();
    if (trimmed.length === 0) {
      return null;
    }
    // AI SDK responseBody is often a JSON-encoded string. Cap parsing so a
    // huge non-JSON body starting with "{" or "[" can't stall the request.
    if (
      (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
      trimmed.length < MAX_BODY_PARSE_LENGTH
    ) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        // An empty parsed body carries no detail; return null so callers
        // fall through to wrapper fallbacks instead of surfacing "{}".
        return extractProviderDetail(parsed, depth + 1) ?? null;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  if (!isRecord(error)) {
    return null;
  }

  if (Array.isArray(error)) {
    for (const item of error) {
      const found = extractProviderDetail(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  // Transport payloads hold the provider text for AI SDK APICallError shapes.
  const payload = extractNested(
    error,
    ["responseBody", "data", "response", "body"],
    depth
  );
  if (payload) {
    return payload;
  }

  // A structured nested payload is more specific than a wrapper message, so
  // check it first. A bare string code ("invalid_api_key") is less specific
  // than a detailed sibling message and is handled below instead.
  const nestedError = error.error;
  if (isRecord(nestedError)) {
    const found = extractProviderDetail(nestedError, depth + 1);
    if (found) {
      return found;
    }
  }

  // A generic SDK wrapper message can still carry the provider sentence
  // after the colon, so keep it as a fallback but never let it shadow
  // a more specific field.
  let wrapperFallback: string | null = null;
  if (nonEmptyString(error.message)) {
    const messageText = error.message.trim();
    if (GENERIC_WRAPPER_PATTERN.test(messageText)) {
      wrapperFallback = messageText;
    } else {
      return messageText;
    }
  }

  for (const key of ["detail", "description"]) {
    if (nonEmptyString(error[key])) {
      return (error[key] as string).trim();
    }
  }

  if (nonEmptyString(nestedError)) {
    return nestedError.trim();
  }

  if (typeof error.code === "string" && typeof error.type === "string") {
    return `${error.type}: ${error.code}`;
  }
  if (typeof error.code === "string" && error.code.length > 0) {
    return error.code;
  }

  const chained = extractNested(
    error,
    ["cause", "error", "response", "data", "body"],
    depth
  );
  if (chained) {
    return chained;
  }
  if (Array.isArray(error.errors)) {
    for (const item of error.errors) {
      const found = extractProviderDetail(item, depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return wrapperFallback;
}

export function getErrorStatus(error: unknown, depth = 0): number | null {
  if (depth > MAX_DEPTH || error === null || typeof error !== "object") {
    return null;
  }
  const record = error as Record<string, unknown>;
  // Status sometimes hides inside a JSON-string payload body.
  for (const key of ["responseBody", "data"] as const) {
    const raw = record[key];
    if (typeof raw === "string") {
      const body = raw.trim();
      if (
        body.length < MAX_BODY_PARSE_LENGTH &&
        (body.startsWith("{") || body.startsWith("["))
      ) {
        try {
          const nested = getErrorStatus(JSON.parse(body), depth + 1);
          if (nested !== null) {
            return nested;
          }
        } catch {
          // Not JSON; fall through to the other fields.
        }
      }
    }
  }
  if (
    typeof record.code === "number" &&
    Number.isFinite(record.code) &&
    record.code >= 100 &&
    record.code < 600
  ) {
    return record.code;
  }
  for (const key of ["statusCode", "status"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const match = value.match(/^\d{3}/);
      if (match) {
        return Number.parseInt(match[0], 10);
      }
    }
  }
  for (const key of ["cause", "error", "response", "data", "body"]) {
    if (record[key] !== undefined) {
      const status = getErrorStatus(record[key], depth + 1);
      if (status !== null) {
        return status;
      }
    }
  }
  return null;
}

export function cleanProviderMessage(raw: string): string {
  let message = raw.trim();
  // Drop SDK wrapper prefixes, keep the provider sentence.
  message = message
    .replace(/^AI_APICallError:\s*/i, "")
    .replace(/^API call failed with status \d+[^:]*:\s*/i, "")
    .replace(/^Provider error:\s*/i, "")
    .trim();
  // Collapse whitespace; toasts render multiline but a wall of JSON is useless.
  message = redactSecrets(message).replace(/\s+/g, " ").trim();
  return truncateMessage(message);
}

export function isAbortError(error: unknown): boolean {
  const detail = extractProviderDetail(error);
  if (detail && ABORT_PATTERN.test(detail)) {
    return true;
  }
  if (
    isRecord(error) &&
    typeof error.name === "string" &&
    error.name === "AbortError"
  ) {
    return true;
  }
  return false;
}

function withTrailingPeriod(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function getStreamErrorMessage(error: unknown): string {
  if (isAbortError(error)) {
    return "Request was cancelled. Please try again.";
  }

  const status = getErrorStatus(error);
  const detail = extractProviderDetail(error);
  const cleaned = detail ? cleanProviderMessage(detail) : "";
  const lowered = cleaned.toLowerCase();

  // Only 401s and explicit key errors imply a bad key. A 403 phrased as
  // "unauthorized" (org/model access) must not tell users to rotate keys.
  if (
    status === 401 ||
    lowered.includes("invalid api key") ||
    lowered.includes("incorrect api key") ||
    lowered.includes("authentication failed")
  ) {
    return cleaned
      ? `Invalid API key: ${withTrailingPeriod(cleaned)} Please check the provider's API key in settings.`
      : "Invalid API key. Please check the provider's API key in settings.";
  }

  if (lowered.includes("decrypt")) {
    return "API key could not be decrypted. If you changed ENCRYPTION_KEY, update the provider's API key in settings.";
  }

  if (cleaned.length > 0) {
    return status
      ? `Provider error (${status}): ${cleaned}`
      : `Provider error: ${cleaned}`;
  }

  return "An error occurred while sending the message. Please try again.";
}

export function sanitizeErrorCause(cause: unknown): string | undefined {
  if (typeof cause === "string") {
    return redactSecrets(cause);
  }
  if (cause instanceof Error) {
    return redactSecrets(cause.message || "Unknown error");
  }
  return undefined;
}

function deepestCause(error: Error): unknown {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (
    current instanceof Error &&
    current.cause !== undefined &&
    !seen.has(current.cause)
  ) {
    seen.add(current);
    current = current.cause;
  }
  return current;
}

export function formatToastDescription(
  message: string,
  cause: unknown
): string {
  const causeText =
    typeof cause === "string"
      ? cause
      : cause instanceof Error
        ? (extractProviderDetail(deepestCause(cause)) ??
          extractProviderDetail(cause) ??
          cause.message)
        : "";
  let description = message;
  if (causeText && !description.includes(causeText)) {
    description += ` ${causeText}`;
  }
  return truncateMessage(redactSecrets(description));
}
