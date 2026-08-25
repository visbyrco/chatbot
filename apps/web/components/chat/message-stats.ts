import { formatCost } from "@/lib/format-cost";
import type { ChatMessage } from "@/lib/types";

export type MessageNerdStats = {
  timeToFirstToken: string;
  tokensPerSecond: string;
  inputTokens: number;
  cacheHitInputTokens: number;
  cacheMissInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cost: string;
};

export function getMessageNerdStats(
  message: ChatMessage,
  statsForNerdsEnabled: boolean
): MessageNerdStats | null {
  const {
    modelName,
    outputTokens,
    timeToFirstToken,
    tokensPerSecond,
    inputTokens,
    cacheHitInputTokens,
    cacheMissInputTokens,
    reasoningTokens,
    cost,
  } = message.metadata ?? {};

  if (
    message.role !== "assistant" ||
    !modelName ||
    !statsForNerdsEnabled ||
    typeof outputTokens !== "number" ||
    typeof timeToFirstToken !== "number" ||
    typeof tokensPerSecond !== "number"
  ) {
    return null;
  }

  return {
    cacheHitInputTokens: Math.round(cacheHitInputTokens ?? 0),
    cacheMissInputTokens: Math.round(cacheMissInputTokens ?? 0),
    cost: formatCost(cost),
    inputTokens: Math.round(inputTokens ?? 0),
    outputTokens: Math.round(outputTokens),
    reasoningTokens: Math.round(reasoningTokens ?? 0),
    timeToFirstToken: (timeToFirstToken / 1000).toFixed(1),
    tokensPerSecond: tokensPerSecond.toFixed(2),
  };
}
