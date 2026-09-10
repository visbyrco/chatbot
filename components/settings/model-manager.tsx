"use client";

import {
  Brain,
  Check,
  Download,
  Eye,
  Loader2,
  type LucideIcon,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AddModelForm } from "./add-model-form";

type CustomModel = {
  capabilities: {
    reasoning: boolean;
    tools: boolean;
    vision: boolean;
    reasoningEfforts?: string[];
  };
  capabilitiesIsCustom: boolean;
  createdAt: string;
  id: string;
  modelId: string;
  name: string;
  nameIsCustom: boolean;
  input: number | null;
  output: number | null;
  cachedInput: number | null;
  cachedOutput: number | null;
  pricingIsCustom: boolean;
  providerId: string;
};

type ModelManagerProps = {
  hasDefaultConfig?: boolean;
  providerId: string;
  providerKey: string | null;
};

type CapabilityKey = "tools" | "vision" | "reasoning";

const CAPABILITY_META: Array<{
  hint: string;
  icon: LucideIcon;
  key: CapabilityKey;
  label: string;
}> = [
  { hint: "Function calling", icon: Wrench, key: "tools", label: "Tools" },
  { hint: "Image input", icon: Eye, key: "vision", label: "Vision" },
  {
    hint: "Extended thinking",
    icon: Brain,
    key: "reasoning",
    label: "Reasoning",
  },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ModelManager({
  hasDefaultConfig = false,
  providerId,
  providerKey,
}: ModelManagerProps) {
  const {
    data: models,
    error,
    isLoading,
    mutate,
  } = useSWR<CustomModel[]>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${providerId}/models`,
    fetcher
  );

  const [showAddModel, setShowAddModel] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleModelAdded = useCallback(() => {
    setShowAddModel(false);
    mutate();
    toast({ description: "Model added", type: "success" });
  }, [mutate]);

  const handleModelDeleted = useCallback(() => {
    mutate();
    toast({ description: "Model removed", type: "success" });
  }, [mutate]);

  const handleModelUpdated = useCallback(() => {
    mutate();
  }, [mutate]);

  const handleAutoDetect = useCallback(async () => {
    setIsDetecting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${providerId}/detect`,
        { method: "POST" }
      );
      const data = await response.json();

      if (data.error) {
        toast({ description: data.error, type: "error" });
      } else {
        toast({
          description: `Detected ${data.detected} model(s)`,
          type: "success",
        });
        mutate();
      }
    } catch {
      toast({ description: "Auto-detection failed", type: "error" });
    } finally {
      setIsDetecting(false);
    }
  }, [mutate, providerId]);

  const handleImportCatalog = useCallback(async () => {
    setIsImporting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${providerId}/import-catalog`,
        { method: "POST" }
      );
      const data = await response.json();

      if (data.error) {
        toast({ description: data.error, type: "error" });
      } else {
        toast({
          description: `Imported ${data.imported} model(s) from catalog`,
          type: "success",
        });
        mutate();
      }
    } catch {
      toast({ description: "Catalog import failed", type: "error" });
    } finally {
      setIsImporting(false);
    }
  }, [mutate, providerId]);

  const handleToggleAddModel = useCallback(() => {
    setShowAddModel((prev) => !prev);
  }, []);

  const handleReset = useCallback(async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${providerId}/reset`,
        { method: "POST" }
      );
      const data = await response.json();

      if (data.error) {
        toast({ description: data.error, type: "error" });
      } else {
        toast({
          description: `Reset ${data.reset} model(s) to default`,
          type: "success",
        });
        mutate();
      }
    } catch {
      toast({ description: "Reset failed", type: "error" });
    } finally {
      setConfirmReset(false);
      setIsResetting(false);
    }
  }, [confirmReset, mutate, providerId]);

  useEffect(() => {
    if (error) {
      toast({ description: "Failed to load models", type: "error" });
    }
  }, [error]);

  return (
    <div className="border-t border-border bg-muted/25 px-3 py-3 sm:px-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          Models
          {models?.length ? (
            <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground tabular-nums">
              {models.length}
            </span>
          ) : null}
          {providerKey ? (
            <span className="font-mono text-[11px] font-normal text-muted-foreground">
              models.dev
            </span>
          ) : null}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {providerKey ? (
            <Button
              className="h-7 px-2.5 text-xs"
              disabled={isImporting}
              onClick={handleImportCatalog}
              size="sm"
              variant="outline"
            >
              {isImporting ? (
                <Loader2 className="mr-1.5 size-3 animate-spin" />
              ) : (
                <Download className="mr-1.5 size-3" />
              )}
              Refresh
            </Button>
          ) : (
            <Button
              className="h-7 px-2.5 text-xs"
              disabled={isDetecting}
              onClick={handleAutoDetect}
              size="sm"
              variant="outline"
            >
              {isDetecting ? (
                <Loader2 className="mr-1.5 size-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3" />
              )}
              Auto-detect
            </Button>
          )}
          <Button
            className="h-7 px-2.5 text-xs shadow-sm"
            onClick={handleToggleAddModel}
            size="sm"
          >
            <Plus className="mr-1 size-3" />
            Add Model
          </Button>
          {hasDefaultConfig ? (
            <Button
              className="h-7 px-2.5 text-xs"
              disabled={isResetting}
              onClick={handleReset}
              size="sm"
              variant={confirmReset ? "destructive" : "ghost"}
            >
              {isResetting ? (
                <Loader2 className="mr-1.5 size-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 size-3" />
              )}
              {confirmReset ? "Confirm reset?" : "Reset"}
            </Button>
          ) : null}
        </div>
      </div>

      {showAddModel ? (
        <div className="mb-3 overflow-hidden rounded-lg border border-border bg-card">
          <AddModelForm
            onModelAdded={handleModelAdded}
            providerId={providerId}
          />
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner />
        </div>
      ) : models?.length ? (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {models.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              onDeleted={handleModelDeleted}
              onUpdated={handleModelUpdated}
              providerId={providerId}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-card/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
          {providerKey
            ? "No models yet. Use Refresh to import them from the catalog."
            : "No models configured. Add a model manually or use auto-detect."}
        </p>
      )}
    </div>
  );
}

function ModelRow({
  model,
  providerId,
  onDeleted,
  onUpdated,
}: {
  model: CustomModel;
  providerId: string;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const [capabilities, setCapabilities] = useState(model.capabilities);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(model.name);

  const handleDelete = useCallback(async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${providerId}/models/${model.id}`,
        { method: "DELETE" }
      );
      if (response.ok) {
        onDeleted();
      } else {
        toast({
          description: "Failed to delete model",
          type: "error",
        });
      }
    } catch {
      toast({
        description: "Failed to delete model",
        type: "error",
      });
    }
  }, [model.id, onDeleted, providerId]);

  const handleSaveName = useCallback(async () => {
    const name = nameInput.trim();
    if (!name || name === model.name) {
      setIsEditingName(false);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${providerId}/models/${model.id}`,
        {
          body: JSON.stringify({ name }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        }
      );
      if (response.ok) {
        onUpdated();
        toast({ description: "Model name updated", type: "success" });
        setIsEditingName(false);
      } else {
        toast({ description: "Failed to update model name", type: "error" });
      }
    } catch {
      toast({ description: "Failed to update model name", type: "error" });
    } finally {
      setIsSaving(false);
    }
  }, [model.id, model.name, nameInput, onUpdated, providerId]);

  const handleCancelEditName = useCallback(() => {
    setNameInput(model.name);
    setIsEditingName(false);
  }, [model.name]);

  const handleStartEditName = useCallback(() => {
    setNameInput(model.name);
    setIsEditingName(true);
  }, [model.name]);

  const handleNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setNameInput(e.target.value);
  }, []);

  const handleNameKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSaveName();
      } else if (e.key === "Escape") {
        handleCancelEditName();
      }
    },
    [handleCancelEditName, handleSaveName]
  );

  const handleToggleCapability = useCallback(
    async (key: CapabilityKey) => {
      const newCapabilities = { ...capabilities, [key]: !capabilities[key] };
      setCapabilities(newCapabilities);
      setIsSaving(true);
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${providerId}/models/${model.id}`,
          {
            body: JSON.stringify({ capabilities: newCapabilities }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          }
        );
        if (response.ok) {
          onUpdated();
          toast({ description: "Capability updated", type: "success" });
        } else {
          setCapabilities(capabilities);
          toast({ description: "Failed to update capability", type: "error" });
        }
      } catch {
        setCapabilities(capabilities);
        toast({ description: "Failed to update capability", type: "error" });
      } finally {
        setIsSaving(false);
      }
    },
    [capabilities, model.id, onUpdated, providerId]
  );

  return (
    <div className="group flex items-start justify-between gap-3 px-3 py-3 transition-colors hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        {isEditingName ? (
          <div className="mb-1.5 flex items-center gap-1">
            <Input
              className="h-7 max-w-56 px-2 text-[13px]"
              onChange={handleNameChange}
              onKeyDown={handleNameKeyDown}
              value={nameInput}
            />
            <Button
              aria-label="Save name"
              className="size-7 p-0"
              disabled={isSaving}
              onClick={handleSaveName}
              size="icon"
              variant="ghost"
            >
              <Check className="size-3.5" />
            </Button>
            <Button
              aria-label="Cancel edit"
              className="size-7 p-0"
              disabled={isSaving}
              onClick={handleCancelEditName}
              size="icon"
              variant="ghost"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold tracking-tight">
              {model.name}
            </p>
            <Button
              aria-label="Edit model name"
              className="size-6 shrink-0 p-0 transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              onClick={handleStartEditName}
              size="icon"
              variant="ghost"
            >
              <Pencil className="size-3 text-muted-foreground" />
            </Button>
            {model.nameIsCustom ||
            model.capabilitiesIsCustom ||
            model.pricingIsCustom ? (
              <span className="shrink-0 rounded border border-border bg-muted px-1 py-px font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                edited
              </span>
            ) : null}
          </div>
        )}
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
          {model.modelId}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80 tabular-nums">
          {model.input === null || model.output === null
            ? "Pricing unavailable"
            : `$${model.input} / $${model.output} per 1M${model.pricingIsCustom ? " · edited" : ""}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CAPABILITY_META.map(({ hint, icon: Icon, key, label }) => (
            <CapabilityPill
              active={capabilities[key]}
              capabilityKey={key}
              disabled={isSaving}
              hint={hint}
              icon={Icon}
              key={key}
              label={label}
              onToggle={handleToggleCapability}
            />
          ))}
        </div>
      </div>
      <Button
        aria-label={`Remove ${model.name}`}
        className="size-8 shrink-0 p-0 text-muted-foreground transition-opacity hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        onClick={handleDelete}
        size="icon"
        variant="ghost"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function CapabilityPill({
  active,
  capabilityKey,
  disabled,
  hint,
  icon: Icon,
  label,
  onToggle,
}: {
  active: boolean;
  capabilityKey: CapabilityKey;
  disabled: boolean;
  hint: string;
  icon: LucideIcon;
  label: string;
  onToggle: (key: CapabilityKey) => void;
}) {
  const handleClick = useCallback(() => {
    onToggle(capabilityKey);
  }, [capabilityKey, onToggle]);

  return (
    <button
      aria-label={`${label} — ${hint}`}
      aria-pressed={active}
      className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "border-foreground/20 bg-foreground/[0.06] text-foreground"
          : "border-transparent bg-foreground/[0.04] text-muted-foreground hover:border-border hover:text-foreground"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      disabled={disabled}
      onClick={handleClick}
      title={hint}
      type="button"
    >
      <span
        className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
      />
      <Icon className="size-3" />
      {label}
    </button>
  );
}
