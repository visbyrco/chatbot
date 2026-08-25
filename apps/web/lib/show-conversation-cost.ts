import { useSyncExternalStore } from "react";
import { syncPreference } from "./preferences-sync";

const COOKIE_NAME = "show-conversation-cost";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const listeners = new Set<() => void>();

function readValue() {
  if (typeof document === "undefined") {
    return false;
  }
  return (
    document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${COOKIE_NAME}=`))
      ?.split("=")[1] === "true"
  );
}

export function setShowConversationCost(enabled: boolean) {
  if (typeof document !== "undefined") {
    // biome-ignore lint/suspicious/noDocumentCookie: synced preference mirror
    document.cookie = `${COOKIE_NAME}=${enabled}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
    syncPreference("showConversationCost");
  }
  for (const listener of listeners) {
    listener();
  }
}

export function useShowConversationCost() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readValue,
    () => false
  );
}
