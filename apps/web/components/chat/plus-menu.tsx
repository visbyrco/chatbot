"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Check, ChevronLeftIcon, PlusIcon, WrenchIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import useSWR from "swr";
import type { ModelCapabilities } from "@/lib/ai/models.client";
import { TOOL_METADATA, type ToolId } from "@/lib/ai/tools/metadata";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { PaperclipIcon } from "./icons";
import { useToolsConfig } from "./tools-menu";

function PurePlusMenuToolItem({
  checked,
  id,
  onToggle,
}: {
  checked: boolean;
  id: ToolId;
  onToggle: (id: ToolId) => void;
}) {
  const meta = TOOL_METADATA[id];
  const handleSelect = useCallback(
    (event: Event) => {
      event.preventDefault();
      onToggle(id);
    },
    [id, onToggle]
  );

  return (
    <DropdownMenuItem onSelect={handleSelect}>
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-md border transition-all",
          checked
            ? "border-primary bg-primary text-primary-foreground glow-primary"
            : "border-foreground/20 bg-foreground/5"
        )}
      >
        {checked ? <Check className="size-3" /> : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] leading-tight">{meta.label}</span>
        <span className="truncate text-[11px] leading-tight text-muted-foreground">
          {meta.description}
        </span>
      </span>
    </DropdownMenuItem>
  );
}

const PlusMenuToolItem = memo(PurePlusMenuToolItem);

function PurePlusMenu({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "tools">("menu");

  const { data: modelsResponse } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { dedupingInterval: 3_600_000, revalidateOnFocus: false }
  );

  const caps: Record<string, ModelCapabilities> | undefined =
    modelsResponse?.capabilities ?? modelsResponse;
  const hasVision = caps?.[selectedModelId]?.vision ?? false;
  const attachmentLabel = hasVision
    ? "Add attachments"
    : "Add attachments (images need a vision model)";

  const {
    allEnabled,
    enabledSet,
    enabledVisibleTools,
    handleDisableAll,
    handleEnableAll,
    supportsTools,
    toggleTool,
    visibleTools,
  } = useToolsConfig(selectedModelId);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setView("menu");
    }
  }, []);

  const handleAddAttachments = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const handleConfigureTools = useCallback((event: Event) => {
    event.preventDefault();
    setView("tools");
  }, []);

  const handleBack = useCallback((event: Event) => {
    event.preventDefault();
    setView("menu");
  }, []);

  const handleCloseAutoFocus = useCallback((event: Event) => {
    if (!window.matchMedia("(max-width: 767px)").matches) {
      return;
    }
    event.preventDefault();
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLTextAreaElement>("[data-testid='multimodal-input']")
        ?.focus();
    });
  }, []);

  return (
    <DropdownMenu onOpenChange={handleOpenChange} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Add attachments or configure tools"
          className="h-7 w-7 shrink-0 rounded-md border border-input bg-foreground/5 p-1 text-foreground transition-all hover:border-primary/30 hover:bg-primary/10 hover:text-primary md:hidden"
          data-testid="plus-menu"
          variant="ghost"
        >
          <PlusIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
        onCloseAutoFocus={handleCloseAutoFocus}
        side="top"
        sideOffset={8}
      >
        {view === "menu" ? (
          <>
            <DropdownMenuItem
              disabled={status !== "ready"}
              onSelect={handleAddAttachments}
            >
              <PaperclipIcon size={14} />
              <span className="min-w-0 flex-1 truncate">{attachmentLabel}</span>
            </DropdownMenuItem>
            {supportsTools ? (
              <DropdownMenuItem onSelect={handleConfigureTools}>
                <WrenchIcon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Configure tools</span>
                {allEnabled ? null : (
                  <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                    {enabledVisibleTools.length}/{visibleTools.length}
                  </span>
                )}
              </DropdownMenuItem>
            ) : null}
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={handleBack}>
              <ChevronLeftIcon className="size-4" />
              Back
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {visibleTools.map((id) => (
              <PlusMenuToolItem
                checked={enabledSet.has(id)}
                id={id}
                key={id}
                onToggle={toggleTool}
              />
            ))}
            <DropdownMenuSeparator />
            <div className="flex gap-1 p-1">
              <Button
                className="h-7 flex-1 rounded-md text-[12px] text-muted-foreground hover:text-foreground"
                onClick={handleEnableAll}
                size="sm"
                type="button"
                variant="ghost"
              >
                Enable all
              </Button>
              <Button
                className="h-7 flex-1 rounded-md text-[12px] text-muted-foreground hover:text-foreground"
                onClick={handleDisableAll}
                size="sm"
                type="button"
                variant="ghost"
              >
                Disable all
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const PlusMenu = memo(PurePlusMenu);
