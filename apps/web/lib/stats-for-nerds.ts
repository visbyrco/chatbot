import { useSyncExternalStore } from "react";
import { syncPreference } from "@/lib/preferences-sync";

const COOKIE_NAME = "stats-for-nerds";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

function getStatsForNerds(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return readCookie(COOKIE_NAME) === "true";
}

export function setStatsForNerds(enabled: boolean) {
  if (typeof document !== "undefined") {
    writeCookie(COOKIE_NAME, String(enabled));
    syncPreference("statsForNerds");
  }
  notifyStatsForNerdsListeners();
}

const statsForNerdsListeners = new Set<() => void>();

function notifyStatsForNerdsListeners() {
  for (const listener of statsForNerdsListeners) {
    listener();
  }
}

function subscribeStatsForNerds(onStoreChange: () => void) {
  statsForNerdsListeners.add(onStoreChange);
  return () => {
    statsForNerdsListeners.delete(onStoreChange);
  };
}

export function useStatsForNerds(): boolean {
  return useSyncExternalStore(
    subscribeStatsForNerds,
    getStatsForNerds,
    () => false
  );
}
