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
import { Badge } from "@/components/ui/badge";
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

  const handleTest = useCallback(async () => {
    setIsTesting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${provider.id}/test`,
        { method: "POST" }
      );
      const data = await response.json();

      if (data.success) {
        toast({ description: data.message, type: "success" });
      } else {
        toast({ description: data.error, type: "error" });
      }
    } catch {
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
      <div className="flex items-center gap-3 rounded-xl border p-3">
        <Button
          className="size-7 p-0"
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

        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/5">
          {provider.providerKey ? (
            <ModelSelectorLogo
              className="size-5"
              provider={provider.providerKey}
            />
          ) : (
            <Server className="size-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{provider.name}</span>
            <Badge variant="secondary">
              {provider.type === "anthropic"
                ? "Anthropic Compatible"
                : "OpenAI Compatible"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {provider.baseURL}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            aria-label="Test connection"
            className="size-7 p-0"
            disabled={isTesting}
            onClick={handleTest}
            size="icon"
            title="Test connection"
            variant="ghost"
          >
            {isTesting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plug className="size-3.5" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="size-7 p-0" size="icon" variant="ghost">
                <MoreHorizontal className="size-3.5" />
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
