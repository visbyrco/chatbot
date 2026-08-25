import { useSyncExternalStore } from "react";
import { syncPreference } from "@/lib/preferences-sync";

const COOKIE_NAME = "enter-behavior";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type EnterBehavior = "send" | "newline";

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

function getEnterBehavior(): EnterBehavior {
  if (typeof document === "undefined") {
    return "send";
  }
  return readCookie(COOKIE_NAME) === "newline" ? "newline" : "send";
}

export function setEnterBehavior(behavior: EnterBehavior) {
  if (typeof document !== "undefined") {
    writeCookie(COOKIE_NAME, behavior);
    syncPreference("enterBehavior");
  }
  notifyEnterBehaviorListeners();
}

const enterBehaviorListeners = new Set<() => void>();

function notifyEnterBehaviorListeners() {
  for (const listener of enterBehaviorListeners) {
    listener();
  }
}

function subscribeEnterBehavior(onStoreChange: () => void) {
  enterBehaviorListeners.add(onStoreChange);
  return () => {
    enterBehaviorListeners.delete(onStoreChange);
  };
}

export function useEnterBehavior(): EnterBehavior {
  return useSyncExternalStore(
    subscribeEnterBehavior,
    getEnterBehavior,
    () => "send"
  );
}
