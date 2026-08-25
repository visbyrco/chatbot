import { TOOL_IDS, TOOL_IDS_SET, type ToolId } from "@/lib/ai/tools/metadata";

/**
 * User preferences that sync across devices. Each value is stored server-side
 * per user and mirrored locally (cookies or localStorage) so it applies
 * immediately and survives SSR.
 *
 * Values are plain JSON-compatible scalars; `null` means "not set".
 */
export type UserPreferences = {
  chatModelId: string | null;
  reasoningEffort: string | null;
  enabledTools: string[] | null;
  titleModelId: string | null;
  titleReasoningEffort: string | null;
  identityDisplayMode: string | null;
  statsForNerds: boolean | null;
  showConversationCost: boolean | null;
  enterBehavior: string | null;
  fontBody: string | null;
  fontHeading: string | null;
  fontLabel: string | null;
  fontMono: string | null;
  fontMath: string | null;
  theme: string | null;
  sidebarCollapsed: boolean | null;
};

export type PreferenceKey = keyof UserPreferences;

export const FONT_ROLE_PREFERENCE_KEYS = {
  body: "fontBody",
  code: "fontMono",
  heading: "fontHeading",
  label: "fontLabel",
  math: "fontMath",
} as const satisfies Record<string, PreferenceKey>;

export const PREFERENCE_KEYS: readonly PreferenceKey[] = [
  "chatModelId",
  "reasoningEffort",
  "enabledTools",
  "titleModelId",
  "titleReasoningEffort",
  "identityDisplayMode",
  "statsForNerds",
  "showConversationCost",
  "enterBehavior",
  "fontBody",
  "fontHeading",
  "fontLabel",
  "fontMono",
  "fontMath",
  "theme",
  "sidebarCollapsed",
];

export const REASONING_EFFORTS = [
  "default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export const IDENTITY_DISPLAY_MODES = ["name", "email", "name-email"] as const;

export const ENTER_BEHAVIORS = ["send", "newline"] as const;

export const THEMES = ["light", "dark", "system"] as const;

export function isValidReasoningEffort(
  value: unknown
): value is (typeof REASONING_EFFORTS)[number] {
  return (
    typeof value === "string" &&
    (REASONING_EFFORTS as readonly string[]).includes(value)
  );
}

export function isValidIdentityDisplayMode(
  value: unknown
): value is (typeof IDENTITY_DISPLAY_MODES)[number] {
  return (
    typeof value === "string" &&
    (IDENTITY_DISPLAY_MODES as readonly string[]).includes(value)
  );
}

export function isValidEnterBehavior(
  value: unknown
): value is (typeof ENTER_BEHAVIORS)[number] {
  return (
    typeof value === "string" &&
    (ENTER_BEHAVIORS as readonly string[]).includes(value)
  );
}

export function isValidTheme(value: unknown): value is (typeof THEMES)[number] {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

export function isValidToolIds(value: unknown): value is ToolId[] {
  return (
    Array.isArray(value) &&
    value.every((id) => typeof id === "string" && TOOL_IDS_SET.has(id))
  );
}

export function normalizeToolIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return TOOL_IDS.filter((id) => (value as string[]).includes(id));
}

export type PreferenceLocalSource =
  | { storageKey: string }
  | { boolean: boolean; cookieName: string; inverse: boolean };

export const PREFERENCE_LOCAL_SOURCES: Record<
  PreferenceKey,
  PreferenceLocalSource
> = {
  chatModelId: { boolean: false, cookieName: "chat-model", inverse: false },
  enabledTools: { boolean: false, cookieName: "chat-tools", inverse: false },
  enterBehavior: {
    boolean: false,
    cookieName: "enter-behavior",
    inverse: false,
  },
  fontBody: { boolean: false, cookieName: "font-body", inverse: false },
  fontHeading: { boolean: false, cookieName: "font-heading", inverse: false },
  fontLabel: { boolean: false, cookieName: "font-label", inverse: false },
  fontMath: { boolean: false, cookieName: "font-math", inverse: false },
  fontMono: { boolean: false, cookieName: "font-mono", inverse: false },
  identityDisplayMode: {
    boolean: false,
    cookieName: "sidebar-identity-display",
    inverse: false,
  },
  reasoningEffort: {
    boolean: false,
    cookieName: "reasoning-effort",
    inverse: false,
  },
  showConversationCost: {
    boolean: true,
    cookieName: "show-conversation-cost",
    inverse: false,
  },
  sidebarCollapsed: {
    boolean: true,
    cookieName: "sidebar_state",
    inverse: true,
  },
  statsForNerds: {
    boolean: true,
    cookieName: "stats-for-nerds",
    inverse: false,
  },
  theme: { storageKey: "theme" },
  titleModelId: { boolean: false, cookieName: "title-model", inverse: false },
  titleReasoningEffort: {
    boolean: false,
    cookieName: "title-reasoning-effort",
    inverse: false,
  },
};
