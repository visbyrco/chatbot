import { describe, expect, it } from "vitest";
import { postRequestBodySchema } from "@/app/(chat)/api/chat/schema";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

function baseBody(selectedChatModel: string) {
  return {
    id: "123e4567-e89b-12d3-a456-426614174001",
    selectedChatModel,
    selectedVisibilityType: "private" as const,
  };
}

describe("postRequestBodySchema selectedChatModel", () => {
  it("accepts ids that isValidModelIdFormat accepts", () => {
    for (const modelId of [
      "openai/gpt-4o",
      `custom-${UUID}/gpt-4o`,
      `custom-${UUID}/openai/gpt-4o`,
      `custom-${UUID}/aion-labs/aion-2.0`,
      `custom-${UUID}/meta-llama/llama-3.3-70b-instruct:free`,
    ]) {
      expect(
        postRequestBodySchema.safeParse(baseBody(modelId)).success
      ).toBe(true);
    }
  });

  it("rejects malformed ids", () => {
    for (const modelId of [
      "gpt-4o",
      `custom-${UUID}/has space`,
      `custom-${UUID}/`,
    ]) {
      const result = postRequestBodySchema.safeParse(baseBody(modelId));
      expect(result.success).toBe(false);
    }
  });
});
