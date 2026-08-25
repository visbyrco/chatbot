"use client";

import { useSyncExternalStore } from "react";
import {
  getPreferencesAppliedVersion,
  subscribePreferencesApplied,
} from "@/lib/preferences-sync";

/**
 * Returns a version number that increments whenever server preferences are
 * mirrored locally. Components that read preferences once on mount can depend
 * on it to re-read when a remote device pushes a change.
 */
export function usePreferencesAppliedVersion(): number {
  return useSyncExternalStore(
    subscribePreferencesApplied,
    getPreferencesAppliedVersion,
    () => 0
  );
}
