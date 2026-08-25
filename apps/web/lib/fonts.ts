import { FONT_ROLE_PREFERENCE_KEYS } from "@/lib/preferences";
import { syncPreference } from "@/lib/preferences-sync";

export type FontOption = {
  id: string;
  label: string;
  stack: string;
  italicStack?: string;
};

const SANS_FALLBACK = "ui-sans-serif, system-ui, sans-serif";
const MONO_FALLBACK =
  'ui-monospace, "SF Mono", "Cascadia Code", "Fira Code", "JetBrains Mono", monospace';
const MATH_SERIF_FALLBACK = '"Times New Roman", Times, serif';

export const SANS_FONTS: readonly FontOption[] = [
  {
    id: "montserrat",
    label: "Montserrat",
    stack: `var(--font-montserrat), ${SANS_FALLBACK}`,
  },
  {
    id: "sora",
    label: "Sora",
    stack: `var(--font-sora), ${SANS_FALLBACK}`,
  },
  {
    id: "manrope",
    label: "Manrope",
    stack: `var(--font-manrope), ${SANS_FALLBACK}`,
  },
  {
    id: "inter",
    label: "Inter",
    stack: `var(--font-inter), ${SANS_FALLBACK}`,
  },
  {
    id: "geist",
    label: "Geist",
    stack: `var(--font-geist), ${SANS_FALLBACK}`,
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    stack: `var(--font-space-grotesk), ${SANS_FALLBACK}`,
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    stack: `var(--font-dm-sans), ${SANS_FALLBACK}`,
  },
  {
    id: "inter-tight",
    label: "Inter Tight",
    stack: `var(--font-inter-tight), ${SANS_FALLBACK}`,
  },
  {
    id: "roboto",
    label: "Roboto",
    stack: `var(--font-roboto), ${SANS_FALLBACK}`,
  },
];

export const MONO_FONTS: readonly FontOption[] = [
  {
    id: "geist-mono",
    label: "Geist Mono",
    stack: `var(--font-geist-mono), ${MONO_FALLBACK}`,
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    stack: `var(--font-jetbrains-mono), ${MONO_FALLBACK}`,
  },
  {
    id: "fira-code",
    label: "Fira Code",
    stack: `var(--font-fira-code), ${MONO_FALLBACK}`,
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    stack: `var(--font-ibm-plex-mono), ${MONO_FALLBACK}`,
  },
  {
    id: "space-mono",
    label: "Space Mono",
    stack: `var(--font-space-mono), ${MONO_FALLBACK}`,
  },
  {
    id: "roboto-mono",
    label: "Roboto Mono",
    stack: `var(--font-roboto-mono), ${MONO_FALLBACK}`,
  },
  {
    id: "cascadia-code",
    label: "Cascadia Code",
    stack: `var(--font-cascadia-code), ${MONO_FALLBACK}`,
  },
  {
    id: "system",
    label: "System",
    stack: MONO_FALLBACK,
  },
];

export const MATH_FONTS: readonly FontOption[] = [
  {
    id: "default",
    italicStack: `"KaTeX_Math", "KaTeX_Main", ${MATH_SERIF_FALLBACK}`,
    label: "Default (Computer Modern)",
    stack: `"KaTeX_Main", "KaTeX_Math", ${MATH_SERIF_FALLBACK}`,
  },
  {
    id: "stix-two-math",
    italicStack: `var(--font-stix-two-math), "KaTeX_Math", ${MATH_SERIF_FALLBACK}`,
    label: "STIX Two Math",
    stack: `var(--font-stix-two-math), "KaTeX_Main", ${MATH_SERIF_FALLBACK}`,
  },
  {
    id: "noto-sans-math",
    italicStack: `var(--font-noto-sans-math), "KaTeX_SansSerif", "KaTeX_Math", ${MATH_SERIF_FALLBACK}`,
    label: "Noto Sans Math",
    stack: `var(--font-noto-sans-math), "KaTeX_SansSerif", "KaTeX_Main", ${MATH_SERIF_FALLBACK}`,
  },
];

export type FontRole = "body" | "heading" | "label" | "code" | "math";

export type FontRoleConfig = {
  label: string;
  description: string;
  cookieName: string;
  cssVar: string;
  cssVarItalic?: string;
  defaultId: string;
  fonts: readonly FontOption[];
};

export const FONT_ROLES: Record<FontRole, FontRoleConfig> = {
  body: {
    cookieName: "font-body",
    cssVar: "--app-font-body",
    defaultId: "montserrat",
    description: "Main interface and body text.",
    fonts: SANS_FONTS,
    label: "Body font",
  },
  code: {
    cookieName: "font-mono",
    cssVar: "--font-mono",
    defaultId: "geist-mono",
    description: "Monospace font used in code blocks.",
    fonts: MONO_FONTS,
    label: "Code font",
  },
  heading: {
    cookieName: "font-heading",
    cssVar: "--app-font-heading",
    defaultId: "sora",
    description: "Headings and titles.",
    fonts: SANS_FONTS,
    label: "Heading font",
  },
  label: {
    cookieName: "font-label",
    cssVar: "--app-font-label",
    defaultId: "manrope",
    description: "Labels and small UI text.",
    fonts: SANS_FONTS,
    label: "Label font",
  },
  math: {
    cookieName: "font-math",
    cssVar: "--math-font",
    cssVarItalic: "--math-font-italic",
    defaultId: "default",
    description: "Font used to render LaTeX math in chat messages.",
    fonts: MATH_FONTS,
    label: "Math font",
  },
};

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

export function parseFontId(role: FontRole, value: string | undefined): string {
  const config = FONT_ROLES[role];
  if (
    value &&
    (config.fonts as readonly FontOption[]).some((font) => font.id === value)
  ) {
    return value;
  }
  return config.defaultId;
}

export function getFontId(role: FontRole): string {
  if (typeof document === "undefined") {
    return FONT_ROLES[role].defaultId;
  }
  return parseFontId(role, readCookie(FONT_ROLES[role].cookieName));
}

export function getFontOption(
  role: FontRole,
  id: string
): FontOption | undefined {
  const config = FONT_ROLES[role];
  return (config.fonts as readonly FontOption[]).find((font) => font.id === id);
}

export function getFontStack(role: FontRole, id: string): string {
  const config = FONT_ROLES[role];
  return (
    config.fonts.find((font) => font.id === id)?.stack ??
    config.fonts.find((font) => font.id === config.defaultId)?.stack ??
    config.fonts[0].stack
  );
}

export function setFontId(role: FontRole, id: string) {
  const config = FONT_ROLES[role];
  const fontId = parseFontId(role, id);
  if (typeof document !== "undefined") {
    writeCookie(config.cookieName, fontId);
    const stack = getFontStack(role, fontId);
    document.documentElement.style.setProperty(config.cssVar, stack);
    if (config.cssVarItalic) {
      document.documentElement.style.setProperty(
        config.cssVarItalic,
        getFontOption(role, fontId)?.italicStack ?? stack
      );
    }
    syncPreference(FONT_ROLE_PREFERENCE_KEYS[role]);
  }
  notifyFontListeners();
}

const fontListeners = new Set<() => void>();

function notifyFontListeners() {
  for (const listener of fontListeners) {
    listener();
  }
}

export function subscribeFonts(onStoreChange: () => void) {
  fontListeners.add(onStoreChange);
  return () => {
    fontListeners.delete(onStoreChange);
  };
}
