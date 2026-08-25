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
import { FONT_ROLES, type FontRole, setFontId } from "@/lib/fonts";
import { useFontId } from "@/lib/fonts-hooks";

function FontSelect({ fontRole }: { fontRole: FontRole }) {
  const fontId = useFontId(fontRole);
  const config = FONT_ROLES[fontRole];
  const current =
    config.fonts.find((font) => font.id === fontId) ?? config.fonts[0];

  const handleChange = useCallback(
    (value: string) => {
      setFontId(fontRole, value);
    },
    [fontRole]
  );

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`font-select-${fontRole}`}>{config.label}</Label>
      <Select onValueChange={handleChange} value={fontId}>
        <SelectTrigger
          className="w-full sm:w-64"
          data-testid={`font-select-${fontRole}`}
          id={`font-select-${fontRole}`}
        >
          <SelectValue style={{ fontFamily: current.stack }} />
        </SelectTrigger>
        <SelectContent>
          {config.fonts.map((font) => (
            <SelectItem key={font.id} value={font.id}>
              <span style={{ fontFamily: font.stack }}>{font.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{config.description}</p>
    </div>
  );
}

export function FontSelectors() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FontSelect fontRole="body" />
      <FontSelect fontRole="heading" />
      <FontSelect fontRole="label" />
      <FontSelect fontRole="code" />
      <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
        <FontSelect fontRole="math" />
      </div>
    </div>
  );
}
