"use client";

import { Globe, Loader2, Sparkles, User } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type AiContext = {
  aiAbout: string | null;
  aiIncludeDate: boolean | null;
  aiIncludeLocation: boolean | null;
  aiInstructions: string | null;
  aiPersonality: string | null;
  aiUserName: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AiContextPanel() {
  const {
    data: aiContext,
    error,
    isLoading,
    mutate,
  } = useSWR<AiContext>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/ai-context`,
    fetcher
  );

  const [includeDate, setIncludeDate] = useState(false);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [userName, setUserName] = useState("");
  const [about, setAbout] = useState("");
  const [personality, setPersonality] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  const handleIncludeDateChange = useCallback(
    (checked: boolean | "indeterminate") => setIncludeDate(checked === true),
    []
  );
  const handleIncludeLocationChange = useCallback(
    (checked: boolean | "indeterminate") =>
      setIncludeLocation(checked === true),
    []
  );
  const handleUserNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setUserName(e.target.value),
    []
  );
  const handleAboutChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => setAbout(e.target.value),
    []
  );
  const handlePersonalityChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setPersonality(e.target.value),
    []
  );
  const handleInstructionsChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => setInstructions(e.target.value),
    []
  );

  useEffect(() => {
    if (aiContext && !hasHydrated) {
      setIncludeDate(aiContext.aiIncludeDate ?? false);
      setIncludeLocation(aiContext.aiIncludeLocation ?? false);
      setUserName(aiContext.aiUserName ?? "");
      setAbout(aiContext.aiAbout ?? "");
      setPersonality(aiContext.aiPersonality ?? "");
      setInstructions(aiContext.aiInstructions ?? "");
      setHasHydrated(true);
    }
  }, [aiContext, hasHydrated]);

  useEffect(() => {
    if (error) {
      toast({ description: "Failed to load personalization", type: "error" });
    }
  }, [error]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/ai-context`,
        {
          body: JSON.stringify({
            aiAbout: about.trim() === "" ? null : about.trim(),
            aiIncludeDate: includeDate,
            aiIncludeLocation: includeLocation,
            aiInstructions:
              instructions.trim() === "" ? null : instructions.trim(),
            aiPersonality:
              personality.trim() === "" ? null : personality.trim(),
            aiUserName: userName.trim() === "" ? null : userName.trim(),
          }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message ?? "Failed to save personalization");
      }

      await mutate();
      toast({ description: "Personalization saved", type: "success" });
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : "Failed to save personalization",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    about,
    includeDate,
    includeLocation,
    instructions,
    mutate,
    personality,
    userName,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Personalization</h3>
        <p className="text-xs text-muted-foreground">
          Customize how the assistant knows and addresses you.
        </p>
      </div>

      {/* Context sharing */}
      <div className="flex flex-col gap-5 rounded-lg border border-border glass-surface p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/5">
            <Globe className="size-3.5 text-muted-foreground" />
          </div>
          <div>
            <h4 className="text-sm font-medium">Context sharing</h4>
            <p className="text-xs text-muted-foreground">
              Choose what contextual information is shared with the assistant.
            </p>
          </div>
        </div>
        <div className="grid gap-3 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/70 px-3 py-2.5">
            <div className="flex flex-col gap-1">
              <Label htmlFor="ai-include-date">Include current date</Label>
              <p className="text-xs text-muted-foreground">
                Share today&apos;s date with the assistant.
              </p>
            </div>
            <Checkbox
              checked={includeDate}
              data-testid="ai-include-date-toggle"
              id="ai-include-date"
              onCheckedChange={handleIncludeDateChange}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/70 px-3 py-2.5">
            <div className="flex flex-col gap-1">
              <Label htmlFor="ai-include-location">
                Include approximate location
              </Label>
              <p className="text-xs text-muted-foreground">
                Share IP-derived country if available. No browser permission
                needed.
              </p>
            </div>
            <Checkbox
              checked={includeLocation}
              data-testid="ai-include-location-toggle"
              id="ai-include-location"
              onCheckedChange={handleIncludeLocationChange}
            />
          </div>
        </div>
      </div>

      {/* About you */}
      <div className="flex flex-col gap-5 rounded-lg border border-border glass-surface p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/5">
            <User className="size-3.5 text-muted-foreground" />
          </div>
          <div>
            <h4 className="text-sm font-medium">About you</h4>
            <p className="text-xs text-muted-foreground">
              Help the assistant know who you are.
            </p>
          </div>
        </div>
        <div className="grid gap-5 border-t border-border pt-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-user-name">Your name</Label>
            <Input
              id="ai-user-name"
              maxLength={128}
              onChange={handleUserNameChange}
              placeholder="e.g. Alex"
              value={userName}
            />
            <p className="text-xs text-muted-foreground">
              How the assistant should address you.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-about">About you</Label>
            <Textarea
              id="ai-about"
              maxLength={4000}
              onChange={handleAboutChange}
              placeholder="Anything you want the assistant to know about you..."
              value={about}
            />
            <p className="text-xs text-muted-foreground">
              Background, interests, or context you want the assistant to
              remember.
            </p>
          </div>
        </div>
      </div>

      {/* Assistant behavior */}
      <div className="flex flex-col gap-5 rounded-lg border border-border glass-surface p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/5">
            <Sparkles className="size-3.5 text-muted-foreground" />
          </div>
          <div>
            <h4 className="text-sm font-medium">Assistant behavior</h4>
            <p className="text-xs text-muted-foreground">
              Shape how the assistant responds to you.
            </p>
          </div>
        </div>
        <div className="grid gap-5 border-t border-border pt-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-personality">Personality</Label>
            <Input
              id="ai-personality"
              maxLength={512}
              onChange={handlePersonalityChange}
              placeholder="e.g. concise, friendly, witty"
              value={personality}
            />
            <p className="text-xs text-muted-foreground">
              Keywords describing the personality the assistant should adopt.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-instructions">Custom instructions</Label>
            <Textarea
              id="ai-instructions"
              maxLength={4000}
              onChange={handleInstructionsChange}
              placeholder="e.g. Always respond with bullet points..."
              value={instructions}
            />
            <p className="text-xs text-muted-foreground">
              Extra instructions added to every conversation.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          data-testid="ai-context-save"
          disabled={isSaving || isLoading}
          onClick={handleSave}
        >
          {isSaving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}
