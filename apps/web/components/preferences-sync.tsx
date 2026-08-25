"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import useSWR from "swr";
import { useSidebar } from "@/components/ui/sidebar";
import { useActiveChat } from "@/hooks/use-active-chat";
import { setEnterBehavior } from "@/lib/enter-behavior";
import { type FontRole, setFontId } from "@/lib/fonts";
import { setIdentityDisplayMode } from "@/lib/identity-display";
import {
  isValidEnterBehavior,
  isValidIdentityDisplayMode,
  isValidReasoningEffort,
  isValidTheme,
  isValidToolIds,
  PREFERENCE_KEYS,
  type PreferenceKey,
} from "@/lib/preferences";
import {
  getLocalPreference,
  notifyPreferencesApplied,
  setApplyingRemote,
  syncPreference,
  writeLocalPreference,
} from "@/lib/preferences-sync";
import { setShowConversationCost } from "@/lib/show-conversation-cost";
import { setStatsForNerds } from "@/lib/stats-for-nerds";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const FONT_PREFERENCE_KEYS = {
  body: "fontBody",
  code: "fontMono",
  heading: "fontHeading",
  label: "fontLabel",
  math: "fontMath",
} as const satisfies Record<FontRole, PreferenceKey>;

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load preferences: ${res.status}`);
  }
  return res.json();
};

/**
 * Keeps user preferences in sync across devices: server values are applied
 * locally on load (server wins), and local changes are pushed back with a
 * debounce. Must be mounted inside ActiveChatProvider and SidebarProvider.
 */
export function PreferencesSync() {
  const { setCurrentModelId, setEnabledTools, setReasoningEffort } =
    useActiveChat();
  const { setTheme, theme } = useTheme();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();

  const { data } = useSWR<Record<string, unknown>>(
    `${BASE_PATH}/api/settings/preferences`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const appliedRef = useRef(false);
  const lastPushedThemeRef = useRef<string | null>(null);
  const lastPushedSidebarRef = useRef<boolean | null>(null);
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;

  useEffect(() => {
    if (!data || appliedRef.current) {
      return;
    }
    appliedRef.current = true;
    const prefs = data;

    setApplyingRemote(true);
    try {
      if (typeof prefs.chatModelId === "string" && prefs.chatModelId) {
        setCurrentModelId(prefs.chatModelId);
        writeLocalPreference("chatModelId", prefs.chatModelId);
      }

      if (isValidReasoningEffort(prefs.reasoningEffort)) {
        setReasoningEffort(prefs.reasoningEffort);
      }

      if (isValidToolIds(prefs.enabledTools)) {
        setEnabledTools(prefs.enabledTools);
      }

      if (typeof prefs.titleModelId === "string") {
        writeLocalPreference("titleModelId", prefs.titleModelId);
      }

      if (isValidReasoningEffort(prefs.titleReasoningEffort)) {
        writeLocalPreference(
          "titleReasoningEffort",
          prefs.titleReasoningEffort
        );
      }

      if (isValidIdentityDisplayMode(prefs.identityDisplayMode)) {
        setIdentityDisplayMode(prefs.identityDisplayMode);
      }

      if (typeof prefs.statsForNerds === "boolean") {
        setStatsForNerds(prefs.statsForNerds);
      }

      if (typeof prefs.showConversationCost === "boolean") {
        setShowConversationCost(prefs.showConversationCost);
      }

      if (isValidEnterBehavior(prefs.enterBehavior)) {
        setEnterBehavior(prefs.enterBehavior);
      }

      for (const [role, key] of Object.entries(FONT_PREFERENCE_KEYS)) {
        const value = prefs[key];
        if (typeof value === "string" && value) {
          setFontId(role as FontRole, value);
        }
      }

      if (isValidTheme(prefs.theme)) {
        lastPushedThemeRef.current = prefs.theme;
        setTheme(prefs.theme);
      }

      if (typeof prefs.sidebarCollapsed === "boolean") {
        const targetOpen = !prefs.sidebarCollapsed;
        lastPushedSidebarRef.current = targetOpen;
        writeLocalPreference("sidebarCollapsed", prefs.sidebarCollapsed);
        if (sidebarOpenRef.current !== targetOpen) {
          setSidebarOpen(targetOpen);
        }
      }

      notifyPreferencesApplied();
    } finally {
      setApplyingRemote(false);
    }

    // First-time sync: push local-only values so pre-existing cookies (set
    // before this feature existed, or while offline) are picked up.
    for (const key of PREFERENCE_KEYS) {
      const serverValue = prefs[key];
      const hasServerValue = serverValue !== undefined && serverValue !== null;
      if (hasServerValue) {
        continue;
      }
      const localValue = getLocalPreference(key);
      if (
        localValue === undefined ||
        localValue === null ||
        localValue === ""
      ) {
        continue;
      }
      syncPreference(key);
    }
  }, [
    data,
    setCurrentModelId,
    setEnabledTools,
    setReasoningEffort,
    setSidebarOpen,
    setTheme,
  ]);

  useEffect(() => {
    if (!theme) {
      return;
    }
    if (lastPushedThemeRef.current === null) {
      lastPushedThemeRef.current = theme;
      return;
    }
    if (theme === lastPushedThemeRef.current) {
      return;
    }
    lastPushedThemeRef.current = theme;
    syncPreference("theme");
  }, [theme]);

  useEffect(() => {
    if (lastPushedSidebarRef.current === null) {
      lastPushedSidebarRef.current = sidebarOpen;
      return;
    }
    if (sidebarOpen === lastPushedSidebarRef.current) {
      return;
    }
    lastPushedSidebarRef.current = sidebarOpen;
    syncPreference("sidebarCollapsed");
  }, [sidebarOpen]);

  return null;
}
