import {
  normalizeToolIds,
  PREFERENCE_LOCAL_SOURCES,
  type PreferenceKey,
} from "@/lib/preferences";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const FLUSH_DEBOUNCE_MS = 500;

let isApplyingRemote = false;
const pendingKeys = new Set<PreferenceKey>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * While the server preferences are being applied locally, the setter side
 * effects (which also call `syncPreference`) must not push the applied values
 * back to the server. This guard makes `syncPreference` a no-op during apply.
 */
export function setApplyingRemote(value: boolean) {
  isApplyingRemote = value;
}

export function syncPreference(key: PreferenceKey) {
  if (isApplyingRemote) {
    return;
  }
  pendingKeys.add(key);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPending().catch(() => undefined);
  }, FLUSH_DEBOUNCE_MS);
}

export function flushPreferencesNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return flushPending();
}

async function flushPending(): Promise<void> {
  if (pendingKeys.size === 0) {
    return;
  }

  const keys = [...pendingKeys];
  pendingKeys.clear();

  const payload: Record<string, unknown> = {};
  for (const key of keys) {
    const value = getLocalPreference(key);
    if (value !== undefined) {
      payload[key] = value;
    }
  }

  if (Object.keys(payload).length === 0) {
    return;
  }

  try {
    await fetch(`${BASE_PATH}/api/settings/preferences`, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "PUT",
    });
  } catch {
    // Network errors are expected (offline); local preferences still apply.
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return;
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") {
    return;
  }
  // biome-ignore lint/suspicious/noDocumentCookie: local cache for synced preferences
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

/**
 * Reads the current local value for a preference from its cookie or
 * localStorage mirror. Returns `undefined` when nothing was set locally.
 */
export function getLocalPreference(key: PreferenceKey): unknown {
  const source = PREFERENCE_LOCAL_SOURCES[key];

  if ("storageKey" in source) {
    if (typeof window === "undefined") {
      return;
    }
    return window.localStorage.getItem(source.storageKey) ?? undefined;
  }

  const raw = readCookie(source.cookieName);
  if (raw === undefined) {
    return;
  }

  if (source.boolean) {
    const boolValue = raw === "true";
    return source.inverse ? !boolValue : boolValue;
  }

  if (key === "enabledTools") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return normalizeToolIds(parsed);
    } catch {
      return;
    }
  }

  return raw;
}

/**
 * Mirrors a synced value into its local cookie or localStorage so it applies
 * immediately and survives SSR. `null`/`undefined` clears the local mirror.
 */
export function writeLocalPreference(key: PreferenceKey, value: unknown) {
  const source = PREFERENCE_LOCAL_SOURCES[key];

  if ("storageKey" in source) {
    if (typeof window === "undefined") {
      return;
    }
    if (value === null || value === undefined) {
      window.localStorage.removeItem(source.storageKey);
    } else {
      window.localStorage.setItem(source.storageKey, String(value));
    }
    return;
  }

  if (value === null || value === undefined) {
    if (typeof document !== "undefined") {
      // biome-ignore lint/suspicious/noDocumentCookie: clearing local mirror
      document.cookie = `${source.cookieName}=; path=/; max-age=0`;
    }
    return;
  }

  if (source.boolean) {
    const boolValue = Boolean(value);
    const raw = source.inverse ? String(!boolValue) : String(boolValue);
    writeCookie(source.cookieName, raw);
    return;
  }

  if (key === "enabledTools") {
    writeCookie(
      source.cookieName,
      JSON.stringify(Array.isArray(value) ? normalizeToolIds(value) : [])
    );
    return;
  }

  writeCookie(source.cookieName, String(value));
}

let appliedVersion = 0;
const appliedListeners = new Set<() => void>();

/**
 * Bumped after server preferences are mirrored locally. Components that read
 * preferences once on mount (e.g. the title model selector) subscribe so they
 * re-read when a remote device pushes a change.
 */
export function notifyPreferencesApplied() {
  appliedVersion += 1;
  for (const listener of appliedListeners) {
    listener();
  }
}

export function subscribePreferencesApplied(listener: () => void): () => void {
  appliedListeners.add(listener);
  return () => {
    appliedListeners.delete(listener);
  };
}

export function getPreferencesAppliedVersion(): number {
  return appliedVersion;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    flushPreferencesNow().catch(() => undefined);
  });
}
