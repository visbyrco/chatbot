import { describe, expect, it } from "vitest";
import {
  cleanProviderMessage,
  extractProviderDetail,
  formatToastDescription,
  getErrorStatus,
  getStreamErrorMessage,
  isAbortError,
  redactSecrets,
  sanitizeErrorCause,
  truncateMessage,
} from "./provider-errors";

describe("redactSecrets", () => {
  it("masks OpenAI-style keys keeping a short prefix", () => {
    expect(redactSecrets("key sk-abcdef1234567890 failed")).toBe(
      "key sk-abcd… failed"
    );
  });

  it("masks api_key assignments and bearer tokens", () => {
    expect(redactSecrets("api_key=secret123 here")).toBe(
      "api_key=[redacted] here"
    );
    expect(redactSecrets("x-api-key: secret123")).toBe("x-api-key: [redacted]");
    expect(redactSecrets("auth Bearer abc.def-ghi")).toBe(
      "auth Bearer [redacted]"
    );
  });

  it("leaves plain messages untouched", () => {
    expect(redactSecrets("You exceeded your quota.")).toBe(
      "You exceeded your quota."
    );
  });
});

describe("truncateMessage", () => {
  it("returns short messages unchanged", () => {
    expect(truncateMessage("hello")).toBe("hello");
  });

  it("truncates long messages with an ellipsis", () => {
    const long = "x".repeat(600);
    const result = truncateMessage(long);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("extractProviderDetail", () => {
  it("parses a JSON-string responseBody", () => {
    const error = {
      message: "API call failed with status 401",
      responseBody: JSON.stringify({
        error: { code: "invalid_api_key", message: "Incorrect API key" },
      }),
      statusCode: 401,
    };
    expect(extractProviderDetail(error)).toBe("Incorrect API key");
  });

  it("parses JSON array bodies", () => {
    expect(
      extractProviderDetail(
        JSON.stringify([{ message: "quota exceeded for model" }])
      )
    ).toContain("quota exceeded");
  });

  it("prefers a structured error object over a generic wrapper message", () => {
    expect(
      extractProviderDetail({
        error: { code: "insufficient_quota", message: "quota exceeded…" },
        message: "API call failed with status 400",
      })
    ).toBe("quota exceeded…");
  });

  it("returns a detailed message when the error field is a bare code", () => {
    expect(
      extractProviderDetail({
        error: "invalid_api_key",
        message: "The request was rejected by the provider",
      })
    ).toBe("The request was rejected by the provider");
  });

  it("reads { code, type } payloads", () => {
    expect(extractProviderDetail({ code: "x", type: "y" })).toBe("y: x");
  });

  it("walks the cause chain", () => {
    const inner = new Error("decrypt failed: bad key");
    expect(extractProviderDetail({ cause: inner })).toContain("decrypt");
  });

  it("does not attempt to parse oversized bodies", () => {
    const huge = `{${"x".repeat(25_000)}`;
    expect(extractProviderDetail(huge)).toBe(huge);
  });

  it("returns null for empty input", () => {
    expect(extractProviderDetail(null)).toBeNull();
    expect(extractProviderDetail("   ")).toBeNull();
    expect(extractProviderDetail({})).toBeNull();
  });

  it("returns null for empty JSON bodies instead of raw braces", () => {
    expect(extractProviderDetail("{}")).toBeNull();
    expect(extractProviderDetail("[]")).toBeNull();
  });
});

describe("getErrorStatus", () => {
  it("reads top-level numeric codes", () => {
    expect(getErrorStatus({ statusCode: 429 })).toBe(429);
  });

  it("accepts status strings with trailing text", () => {
    expect(getErrorStatus({ status: "401 Unauthorized" })).toBe(401);
  });

  it("finds nested response status", () => {
    expect(getErrorStatus({ response: { status: 503 } })).toBe(503);
  });

  it("returns null when no status exists", () => {
    expect(getErrorStatus(new Error("boom"))).toBeNull();
  });

  it("finds status inside a JSON-string body", () => {
    expect(
      getErrorStatus({
        responseBody: JSON.stringify({ error: { status: 429 } }),
      })
    ).toBe(429);
  });

  it("reads numeric error codes", () => {
    expect(getErrorStatus({ code: 503 })).toBe(503);
    expect(getErrorStatus({ code: 99 })).toBeNull();
  });
});

describe("cleanProviderMessage", () => {
  it("strips SDK wrapper prefixes", () => {
    expect(cleanProviderMessage("API call failed with status 401: Nope")).toBe(
      "Nope"
    );
    expect(cleanProviderMessage("AI_APICallError: Nope")).toBe("Nope");
  });

  it("redacts secrets and truncates", () => {
    const cleaned = cleanProviderMessage(
      `bad key sk-abcdef1234567890 ${"y".repeat(600)}`
    );
    expect(cleaned).toContain("sk-abcd…");
    expect(cleaned.length).toBeLessThanOrEqual(500);
  });

  it("redacts xAI, Google, and org prefixes", () => {
    expect(redactSecrets("key xai-abc123XYZ failed")).toBe(
      "key [redacted] failed"
    );
    expect(
      redactSecrets("key AIzaSyAbcdefghij1234567890abcdefghi failed")
    ).toBe("key [redacted] failed");
    expect(redactSecrets("org org-abc123XYZ789 here")).toBe(
      "org org-[redacted] here"
    );
  });
});

describe("isAbortError", () => {
  it("detects aborts and AbortError names", () => {
    expect(isAbortError(new Error("Aborted by user"))).toBe(true);
    expect(isAbortError({ message: "signal aborted" })).toBe(true);
    expect(
      isAbortError(Object.assign(new Error("stop"), { name: "AbortError" }))
    ).toBe(true);
  });

  it("does not flag provider errors", () => {
    expect(isAbortError(new Error("Incorrect API key"))).toBe(false);
  });

  it("does not treat billing cancellations as aborts", () => {
    const message = getStreamErrorMessage(
      new Error("Your subscription was cancelled due to billing")
    );
    expect(message).not.toBe("Request was cancelled. Please try again.");
    expect(message).toContain("Provider error");
  });
});

describe("getStreamErrorMessage", () => {
  it("maps 401 payloads to the invalid-key message", () => {
    expect(
      getStreamErrorMessage({
        responseBody: JSON.stringify({
          error: { code: "invalid_api_key", message: "Incorrect API key" },
        }),
        statusCode: 401,
      })
    ).toBe(
      "Invalid API key: Incorrect API key. Please check the provider's API key in settings."
    );
  });

  it("maps explicit key errors without a status", () => {
    expect(getStreamErrorMessage(new Error("Invalid api key supplied"))).toBe(
      "Invalid API key: Invalid api key supplied. Please check the provider's API key in settings."
    );
  });

  it("does not blame the key for 403 org-access errors", () => {
    const message = getStreamErrorMessage({
      message: "organization unauthorized for model",
      statusCode: 403,
    });
    expect(message).toContain("Provider error (403)");
    expect(message).not.toContain("Invalid API key");
  });

  it("reports decrypt failures", () => {
    expect(getStreamErrorMessage(new Error("decrypt failed"))).toContain(
      "could not be decrypted"
    );
  });

  it("reports cancellations without blaming the provider", () => {
    expect(getStreamErrorMessage(new Error("Aborted by user"))).toBe(
      "Request was cancelled. Please try again."
    );
  });

  it("includes the status for generic provider errors", () => {
    expect(
      getStreamErrorMessage({ message: "quota exceeded", statusCode: 429 })
    ).toBe("Provider error (429): quota exceeded");
  });

  it("falls back to the generic message", () => {
    expect(getStreamErrorMessage({})).toBe(
      "An error occurred while sending the message. Please try again."
    );
  });
});

describe("sanitizeErrorCause", () => {
  it("redacts string causes", () => {
    expect(sanitizeErrorCause("key sk-abcdef123456")).toBe("key sk-abcd…");
  });

  it("serializes Error causes instead of dropping them", () => {
    expect(sanitizeErrorCause(new Error("decrypt failed"))).toBe(
      "decrypt failed"
    );
    const emptyMessage = new Error("placeholder");
    emptyMessage.message = "";
    expect(sanitizeErrorCause(emptyMessage)).toBe("Unknown error");
  });

  it("returns undefined for other values", () => {
    expect(sanitizeErrorCause(undefined)).toBeUndefined();
    expect(sanitizeErrorCause(42)).toBeUndefined();
  });
});

describe("formatToastDescription", () => {
  it("appends a distinct cause", () => {
    expect(formatToastDescription("Request failed", "quota exceeded")).toBe(
      "Request failed quota exceeded"
    );
  });

  it("dedupes a cause already contained in the message", () => {
    expect(
      formatToastDescription("Request failed: quota exceeded", "quota exceeded")
    ).toBe("Request failed: quota exceeded");
  });

  it("truncates long descriptions", () => {
    const result = formatToastDescription("x".repeat(400), "y".repeat(400));
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it("unwraps nested Error causes", () => {
    const inner = new Error("API call failed", {
      cause: { responseBody: { error: { message: "model overloaded" } } },
    });
    const outer = new Error("request failed", { cause: inner });
    expect(formatToastDescription("request failed", outer)).toContain(
      "model overloaded"
    );
  });
});
