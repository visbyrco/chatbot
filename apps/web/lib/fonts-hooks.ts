"use client";

import { useSyncExternalStore } from "react";
import {
  FONT_ROLES,
  type FontRole,
  getFontId,
  subscribeFonts,
} from "@/lib/fonts";

export function useFontId(role: FontRole): string {
  return useSyncExternalStore(
    subscribeFonts,
    () => getFontId(role),
    () => FONT_ROLES[role].defaultId
  );
}
