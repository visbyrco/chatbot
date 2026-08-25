export type ReasoningEffort =
  | "default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
  reasoningEfforts?: string[];
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  providerKey?: string | null;
  description: string;
  reasoningEffort?: ReasoningEffort;
};
