"use client";

import {
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plug,
  Server,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProviderForm } from "./provider-form";

type ProviderCardProps = {
  provider: {
    baseURL: string;
    createdAt: string;
    id: string;
    name: string;
    providerKey: string | null;
    type: "openai" | "anthropic";
    updatedAt: string;
    userId: string;
  };
  isExpanded: boolean;
  onToggle: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
};

export function ProviderCard({
  provider,
  isExpanded,
  onToggle,
  onDeleted,
  onUpdated,
}: ProviderCardProps) {
  const [showEdit, setShowEdit] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [testStatus, setTestStatus] = useState<"error" | "idle" | "success">(
    "idle"
  );

  const handleTest = useCallback(async () => {
    setIsTesting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${provider.id}/test`,
        { method: "POST" }
      );
      const data = await response.json();

      if (data.success) {
        setTestStatus("success");
        toast({ description: data.message, type: "success" });
      } else {
        setTestStatus("error");
        toast({ description: data.error, type: "error" });
      }
    } catch {
      setTestStatus("error");
      toast({ description: "Connection test failed", type: "error" });
    } finally {
      setIsTesting(false);
    }
  }, [provider.id]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${provider.id}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        onDeleted();
      } else {
        toast({ description: "Failed to delete provider", type: "error" });
      }
    } catch {
      toast({ description: "Failed to delete provider", type: "error" });
    } finally {
      setIsDeleting(false);
    }
  }, [onDeleted, provider.id]);

  const handleEditSaved = useCallback(() => {
    setShowEdit(false);
    onUpdated();
  }, [onUpdated]);

  const handleOpenEdit = useCallback(() => {
    setShowEdit(true);
  }, []);

  return (
    <>
      <div
        className="flex min-h-[68px] items-center gap-3 px-3 py-3 transition-colors duration-200 data-[expanded=true]:bg-muted/40"
        data-expanded={isExpanded}
      >
        <Button
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse models" : "Expand models"}
          className="size-8 shrink-0 rounded-md border border-transparent p-0 text-muted-foreground hover:border-border hover:text-foreground"
          onClick={onToggle}
          size="icon"
          variant="ghost"
        >
          {isExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </Button>

        <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted/60">
          {provider.providerKey ? (
            <ModelSelectorLogo
              className="size-5"
              provider={provider.providerKey}
            />
          ) : (
            <Server className="size-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <button
            aria-expanded={isExpanded}
            className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onToggle}
            type="button"
          >
            <span
              aria-label={
                testStatus === "success"
                  ? "Last connection test succeeded"
                  : testStatus === "error"
                    ? "Last connection test failed"
                    : "Not tested yet"
              }
              className={
                testStatus === "success"
                  ? "size-1.5 shrink-0 rounded-full bg-emerald-500"
                  : testStatus === "error"
                    ? "size-1.5 shrink-0 rounded-full bg-destructive"
                    : "size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
              }
              role="status"
            />
            <span className="truncate text-[14px] font-semibold tracking-tight">
              {provider.name}
            </span>
            <span className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              {provider.type === "anthropic" ? "Anthropic" : "OpenAI"}
            </span>
          </button>
          <p className="w-full truncate font-mono text-xs text-muted-foreground select-text">
            {provider.baseURL}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            aria-label="Test connection"
            className="h-8 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            disabled={isTesting}
            onClick={handleTest}
            size="sm"
            title="Test connection"
            variant="ghost"
          >
            {isTesting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plug className="size-3.5" />
            )}
            <span className="hidden lg:inline">Test</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Provider actions"
                className="size-8 p-0 text-muted-foreground hover:text-foreground"
                size="icon"
                variant="ghost"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleOpenEdit}>
                <Pencil className="mr-2 size-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                disabled={isDeleting}
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog onOpenChange={setShowEdit} open={showEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Provider</DialogTitle>
          </DialogHeader>
          <ProviderForm
            initialData={{
              baseURL: provider.baseURL,
              id: provider.id,
              name: provider.name,
              providerKey: provider.providerKey,
              type: provider.type,
            }}
            isEdit
            onCreated={handleEditSaved}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
