"use client";

import { useCallback } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IDENTITY_DISPLAY_MODE_LABELS,
  IDENTITY_DISPLAY_MODES,
  type IdentityDisplayMode,
  setIdentityDisplayMode,
  useIdentityDisplayMode,
} from "@/lib/identity-display";

export function IdentityDisplaySelector() {
  const identityDisplayMode = useIdentityDisplayMode();

  const handleModeChange = useCallback((mode: string) => {
    setIdentityDisplayMode(mode as IdentityDisplayMode);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="identity-display">Sidebar identity</Label>
      <Select onValueChange={handleModeChange} value={identityDisplayMode}>
        <SelectTrigger id="identity-display">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {IDENTITY_DISPLAY_MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {IDENTITY_DISPLAY_MODE_LABELS[mode]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Choose what to show next to your avatar in the sidebar.
      </p>
    </div>
  );
}
