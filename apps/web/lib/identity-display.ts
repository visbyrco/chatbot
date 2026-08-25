import { useSyncExternalStore } from "react";
import { syncPreference } from "@/lib/preferences-sync";

export type IdentityDisplayMode = "name" | "email" | "name-email";

export const IDENTITY_DISPLAY_MODES: readonly IdentityDisplayMode[] = [
  "name",
  "email",
  "name-email",
];

export const IDENTITY_DISPLAY_MODE_LABELS: Record<IdentityDisplayMode, string> =
  {
    email: "Email",
    name: "Name",
    "name-email": "Name + email",
  };

const COOKIE_NAME = "sidebar-identity-display";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

function parseMode(value: string | undefined): IdentityDisplayMode {
  return value && (IDENTITY_DISPLAY_MODES as readonly string[]).includes(value)
    ? (value as IdentityDisplayMode)
    : "name";
}

function getIdentityDisplayMode(): IdentityDisplayMode {
  if (typeof document === "undefined") {
    return "name";
  }
  return parseMode(readCookie(COOKIE_NAME));
}

export function setIdentityDisplayMode(mode: IdentityDisplayMode) {
  if (typeof document !== "undefined") {
    writeCookie(COOKIE_NAME, mode);
    syncPreference("identityDisplayMode");
  }
  notifyIdentityDisplayListeners();
}

const identityDisplayListeners = new Set<() => void>();

function notifyIdentityDisplayListeners() {
  for (const listener of identityDisplayListeners) {
    listener();
  }
}

function subscribeIdentityDisplay(onStoreChange: () => void) {
  identityDisplayListeners.add(onStoreChange);
  return () => {
    identityDisplayListeners.delete(onStoreChange);
  };
}

export function useIdentityDisplayMode(): IdentityDisplayMode {
  return useSyncExternalStore(
    subscribeIdentityDisplay,
    getIdentityDisplayMode,
    () => "name"
  );
}
