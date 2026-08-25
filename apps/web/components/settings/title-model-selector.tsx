"use client";

import { useCallback, useEffect, useState } from "react";
import { ModelSelectorCompact } from "@/components/chat/multimodal-input";
import { Label } from "@/components/ui/label";
import type { ReasoningEffort } from "@/lib/ai/models.client";
import { usePreferencesAppliedVersion } from "@/lib/preferences-hooks";
import { syncPreference } from "@/lib/preferences-sync";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const VALID_REASONING_EFFORTS: ReasoningEffort[] = [
  "default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

function writeCookie(name: string, value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function TitleModelSelector() {
  const [titleModelId, setTitleModelId] = useState("");
  const [titleEffort, setTitleEffort] = useState<ReasoningEffort>("default");
  const appliedVersion = usePreferencesAppliedVersion();

  // biome-ignore lint/correctness/useExhaustiveDependencies: appliedVersion only triggers a re-read of the title-model cookies after remote preferences are applied.
  useEffect(() => {
    // document is unavailable during SSR; read the cookies once the client
    // has hydrated. Re-reads when server preferences are applied remotely.
    const cookieModel = readCookie("title-model");
    if (cookieModel) {
      setTitleModelId(cookieModel);
    }
    const cookieEffort = readCookie("title-reasoning-effort");
    if (
      cookieEffort &&
      (VALID_REASONING_EFFORTS as string[]).includes(cookieEffort)
    ) {
      setTitleEffort(cookieEffort as ReasoningEffort);
    }
  }, [appliedVersion]);

  const handleModelChange = useCallback((modelId: string) => {
    setTitleModelId(modelId);
  }, []);

  const handleEffortChange = useCallback((effort: ReasoningEffort) => {
    setTitleEffort(effort);
    writeCookie("title-reasoning-effort", effort);
    syncPreference("titleReasoningEffort");
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <Label>Title model</Label>
      <ModelSelectorCompact
        defaultLabel="Use active chat model"
        modelCookieName="title-model"
        onModelChange={handleModelChange}
        reasoningEffort={titleEffort}
        selectedModelId={titleModelId}
        setReasoningEffort={handleEffortChange}
      />
      <p className="text-xs text-muted-foreground">
        Model used to generate chat titles. If not set, the active chat model is
        used.
      </p>
    </div>
  );
}
