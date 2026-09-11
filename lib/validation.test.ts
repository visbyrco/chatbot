import { describe, expect, it } from "vitest";
import { isValidModelIdFormat } from "./validation";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("isValidModelIdFormat", () => {
  it("accepts simple custom model ids", () => {
    expect(isValidModelIdFormat(`custom-${UUID}/gpt-4o`)).toBe(true);
  });

  it("accepts nested provider namespacing from aggregators", () => {
    expect(isValidModelIdFormat(`custom-${UUID}/openai/gpt-4o`)).toBe(true);
    expect(isValidModelIdFormat(`custom-${UUID}/aion-labs/aion-2.0`)).toBe(
      true
    );
  });

  it("accepts OpenRouter free-variant suffixes", () => {
    expect(
      isValidModelIdFormat(
        `custom-${UUID}/meta-llama/llama-3.3-70b-instruct:free`
      )
    ).toBe(true);
  });

  it("accepts legacy provider/model ids", () => {
    expect(isValidModelIdFormat("openai/gpt-4o")).toBe(true);
  });

  it("rejects malformed ids", () => {
    expect(isValidModelIdFormat("")).toBe(false);
    expect(isValidModelIdFormat("gpt-4o")).toBe(false);
    expect(isValidModelIdFormat(`custom-${UUID}/has space`)).toBe(false);
    expect(isValidModelIdFormat(`custom-${UUID}/`)).toBe(false);
    expect(isValidModelIdFormat("a".repeat(201))).toBe(false);
  });
});
