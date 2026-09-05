"use client";

import { motion } from "framer-motion";
import {
  Download,
  Keyboard,
  type LucideIcon,
  Palette,
  Plus,
  Scale,
  Server,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Type,
  Wrench,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { AiContextPanel } from "@/components/settings/ai-context-panel";
import { ExportAttachments } from "@/components/settings/export-attachments";
import { ExportChats } from "@/components/settings/export-chats";
import { FontSelectors } from "@/components/settings/font-selectors";
import { IdentityDisplaySelector } from "@/components/settings/identity-display-selector";
import { LegalPanel } from "@/components/settings/legal-panel";
import { ModelManager } from "@/components/settings/model-manager";
import { ProviderCard } from "@/components/settings/provider-card";
import { ProviderForm } from "@/components/settings/provider-form";
import { TitleModelSelector } from "@/components/settings/title-model-selector";
import { ToolsPanel } from "@/components/settings/tools-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  type EnterBehavior,
  setEnterBehavior,
  useEnterBehavior,
} from "@/lib/enter-behavior";
import {
  setShowConversationCost,
  useShowConversationCost,
} from "@/lib/show-conversation-cost";
import { setStatsForNerds, useStatsForNerds } from "@/lib/stats-for-nerds";
import { cn } from "@/lib/utils";

type CustomProvider = {
  baseURL: string;
  createdAt: string;
  hasDefaultConfig?: boolean;
  id: string;
  name: string;
  providerKey: string | null;
  type: "openai" | "anthropic";
  updatedAt: string;
  userId: string;
};

type SettingsSection =
  | "preferences"
  | "ai-context"
  | "data"
  | "providers"
  | "tools"
  | "legal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const NAV_ITEMS = [
  {
    description: "Model defaults, theme, and identity",
    icon: SlidersHorizontal,
    id: "preferences",
    label: "Preferences",
    title: "Chat preferences",
  },
  {
    description: "Name, personality, and instructions for the assistant",
    icon: Sparkles,
    id: "ai-context",
    label: "Personalization",
    title: "Personalization",
  },
  {
    description: "Export chats and attachment files",
    icon: Download,
    id: "data",
    label: "Data",
    title: "Data & exports",
  },
  {
    description: "Custom API endpoints and models",
    icon: Server,
    id: "providers",
    label: "Providers",
    title: "Providers & models",
  },
  {
    description: "Configure tools that require setup",
    icon: Wrench,
    id: "tools",
    label: "Tools",
    title: "Tools",
  },
  {
    description: "Privacy policy and terms of service",
    icon: Scale,
    id: "legal",
    label: "Legal",
    title: "Legal",
  },
] as const satisfies ReadonlyArray<{
  description: string;
  icon: LucideIcon;
  id: SettingsSection;
  label: string;
  title: string;
}>;

export function SettingsDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("preferences");
  const activeItem =
    NAV_ITEMS.find((item) => item.id === activeSection) ?? NAV_ITEMS[0];
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const handleSelectSection = useCallback((section: SettingsSection) => {
    setActiveSection(section);
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, []);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="h-[min(46rem,calc(100dvh-1rem))] w-[min(64rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-lg! p-0 md:h-[min(46rem,calc(100dvh-2rem))] md:w-[min(68rem,calc(100vw-2rem))] md:max-w-[calc(100vw-2rem)]"
        data-testid="settings-dialog"
        showCloseButton={false}
      >
        <div className="grid h-full min-h-0 md:grid-cols-[16.5rem_minmax(0,1fr)]">
          <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col">
            <div className="flex items-start gap-3 px-5 pb-5 pt-6">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-foreground/10 text-sidebar-foreground">
                <Settings2 className="size-4" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold tracking-tight">Settings</p>
                <DialogDescription className="text-xs leading-5 text-sidebar-foreground/50">
                  Workspace configuration
                </DialogDescription>
              </div>
            </div>

            <nav aria-label="Settings" className="flex flex-col gap-1 px-3">
              {NAV_ITEMS.map((item, index) => (
                <SettingsNavButton
                  active={item.id === activeSection}
                  enterDelay={index * 35}
                  icon={item.icon}
                  id={item.id}
                  key={item.id}
                  label={item.label}
                  onSelect={handleSelectSection}
                />
              ))}
            </nav>
          </aside>

          <main className="flex min-h-0 flex-col overflow-hidden bg-transparent">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-transparent/95 px-5 py-4 backdrop-blur-xl md:px-8 md:py-5">
              <div className="flex min-w-0 flex-col gap-1">
                <div
                  className="fade-up flex min-w-0 flex-col gap-1"
                  key={activeSection}
                >
                  <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                    {activeItem.label}
                  </p>
                  <DialogTitle className="text-xl font-semibold tracking-tight">
                    {activeItem.title}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {activeItem.description}
                  </p>
                </div>
              </div>
              <DialogClose asChild>
                <Button
                  aria-label="Close settings"
                  className="-mr-2 text-muted-foreground"
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="size-4" />
                  <span className="sr-only">Close settings</span>
                </Button>
              </DialogClose>
            </header>

            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border glass-surface px-3 py-2 no-scrollbar [mask-image:linear-gradient(to_right,black_88%,transparent)] md:hidden">
              {NAV_ITEMS.map((item, index) => (
                <MobileSettingsNavButton
                  active={item.id === activeSection}
                  enterDelay={index * 30}
                  icon={item.icon}
                  id={item.id}
                  key={item.id}
                  label={item.label}
                  onSelect={handleSelectSection}
                />
              ))}
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-behavior-contain supports-[scrollbar-gutter:stable]:[scrollbar-gutter:stable]"
              ref={contentScrollRef}
            >
              <div className="mx-auto w-full max-w-3xl px-5 py-6 md:px-8 md:py-8">
                <div className="fade-up flex flex-col gap-6" key={activeSection}>
                  {activeSection === "preferences" ? <PreferencesPanel /> : null}
                  {activeSection === "ai-context" ? <AiContextPanel /> : null}
                  {activeSection === "data" ? <DataPanel /> : null}
                  {activeSection === "providers" ? <ProvidersPanel /> : null}
                  {activeSection === "tools" ? <ToolsPanel /> : null}
                  {activeSection === "legal" ? <LegalPanel /> : null}
                </div>
              </div>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsNavButton({
  active,
  enterDelay,
  icon: Icon,
  id,
  label,
  onSelect,
}: {
  active: boolean;
  enterDelay: number;
  icon: LucideIcon;
  id: SettingsSection;
  label: string;
  onSelect: (id: SettingsSection) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(id);
  }, [id, onSelect]);
  const description = NAV_ITEMS.find((item) => item.id === id)?.description;

  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={cn(
        "fade-up relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150",
        active
          ? "text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
      onClick={handleSelect}
      style={{ animationDelay: `${enterDelay}ms` }}
      title={description}
      type="button"
    >
      {active ? (
        <motion.span
          className="absolute inset-0 rounded-lg bg-sidebar-accent"
          layoutId="settings-nav-active"
          transition={{ damping: 34, stiffness: 420, type: "spring" }}
        />
      ) : null}
      <Icon className="relative size-4 shrink-0" />
      <span className="relative truncate font-medium">{label}</span>
    </button>
  );
}

function MobileSettingsNavButton({
  active,
  enterDelay,
  icon: Icon,
  id,
  label,
  onSelect,
}: {
  active: boolean;
  enterDelay: number;
  icon: LucideIcon;
  id: SettingsSection;
  label: string;
  onSelect: (id: SettingsSection) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(id);
  }, [id, onSelect]);

  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "fade-up relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150",
        active
          ? "text-background"
          : "bg-foreground/5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      )}
      onClick={handleSelect}
      style={{ animationDelay: `${enterDelay}ms` }}
      type="button"
    >
      {active ? (
        <motion.span
          className="absolute inset-0 rounded-lg bg-foreground"
          layoutId="settings-nav-active-mobile"
          transition={{ damping: 34, stiffness: 420, type: "spring" }}
        />
      ) : null}
      <Icon className="relative size-3.5" />
      <span className="relative">{label}</span>
    </button>
  );
}

function PreferencesPanel() {
  const { theme, setTheme } = useTheme();
  const statsForNerds = useStatsForNerds();
  const showConversationCost = useShowConversationCost();

  return (
    <div className="flex flex-col gap-6">
      {/* General */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <SlidersHorizontal className="size-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">General</h3>
            <p className="text-xs text-muted-foreground">
              Defaults for new chats and sidebar identity.
            </p>
          </div>
        </div>
        <div className="divide-y divide-border border-t border-border">
          <div className="grid gap-5 px-5 py-5">
            <TitleModelSelector />
            <IdentityDisplaySelector />
          </div>
          <div className="px-5 py-5">
            <EnterBehaviorSelector />
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Palette className="size-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Appearance</h3>
            <p className="text-xs text-muted-foreground">
              Theme and typography — stored locally in this browser.
            </p>
          </div>
        </div>
        <div className="divide-y divide-border border-t border-border">
          <div className="flex flex-col gap-2 px-5 py-5">
            <Label htmlFor="theme">Theme</Label>
            <Select onValueChange={setTheme} value={theme}>
              <SelectTrigger className="w-full sm:w-64" id="theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="px-5 py-5">
            <div className="mb-3 flex items-center gap-2">
              <Type className="size-3.5 text-muted-foreground" />
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Typography
              </h4>
            </div>
            <FontSelectors />
          </div>
        </div>
      </section>

      {/* Insights */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Keyboard className="size-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Diagnostics</h3>
            <p className="text-xs text-muted-foreground">
              Optional details shown in the conversation UI.
            </p>
          </div>
        </div>
        <div className="divide-y divide-border border-t border-border">
          <label
            className="flex cursor-pointer items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50"
            htmlFor="stats-for-nerds"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Stats for nerds</span>
              <span className="text-xs text-muted-foreground">
                Show token and latency details on responses.
              </span>
            </span>
            <Checkbox
              checked={statsForNerds}
              data-testid="stats-for-nerds-toggle"
              id="stats-for-nerds"
              onCheckedChange={setStatsForNerds}
            />
          </label>
          <label
            className="flex cursor-pointer items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50"
            htmlFor="show-conversation-cost"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                Show conversation cost
              </span>
              <span className="text-xs text-muted-foreground">
                Show model pricing in the conversation drawer.
              </span>
            </span>
            <Checkbox
              checked={showConversationCost}
              data-testid="show-conversation-cost-toggle"
              id="show-conversation-cost"
              onCheckedChange={setShowConversationCost}
            />
          </label>
        </div>
      </section>
    </div>
  );
}

function EnterBehaviorSelector() {
  const enterBehavior = useEnterBehavior();

  const handleValueChange = useCallback((value: string) => {
    setEnterBehavior(value as EnterBehavior);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="enter-behavior">Enter key behavior</Label>
      <Select onValueChange={handleValueChange} value={enterBehavior}>
        <SelectTrigger className="w-full sm:w-64" id="enter-behavior">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="send">
            Enter to send (Shift+Enter for new line)
          </SelectItem>
          <SelectItem value="newline">
            Ctrl+Enter to send (Enter for new line)
          </SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Choose how the Enter key behaves in the chat composer.
      </p>
    </div>
  );
}

function DataPanel() {
  return (
    <>
      <ExportChats />
      <ExportAttachments />
    </>
  );
}

function ProvidersPanel() {
  const {
    data: providers,
    error,
    isLoading,
    mutate,
  } = useSWR<CustomProvider[]>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers`,
    fetcher
  );

  const [showAddProvider, setShowAddProvider] = useState(false);
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(
    null
  );

  const handleOpenAddProvider = useCallback(() => {
    setShowAddProvider(true);
  }, []);

  const handleProviderCreated = useCallback(() => {
    setShowAddProvider(false);
    mutate();
    toast({ description: "Provider added successfully", type: "success" });
  }, [mutate]);

  const handleProviderDeleted = useCallback(
    (id: string) => {
      setExpandedProviderId((current) => (current === id ? null : current));
      mutate();
      toast({ description: "Provider deleted", type: "success" });
    },
    [mutate]
  );

  const handleProviderUpdated = useCallback(() => {
    mutate();
    toast({ description: "Provider updated", type: "success" });
  }, [mutate]);

  const handleToggleProvider = useCallback((id: string) => {
    setExpandedProviderId((current) => (current === id ? null : id));
  }, []);

  useEffect(() => {
    if (error) {
      toast({ description: "Failed to load providers", type: "error" });
    }
  }, [error]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Custom providers</h3>
          <p className="text-xs text-muted-foreground">
            OpenAI and Anthropic compatible endpoints.
          </p>
        </div>
        <Button onClick={handleOpenAddProvider} size="sm">
          <Plus className="mr-1.5 size-3.5" />
          Add Provider
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : providers?.length ? (
        <div className="flex flex-col gap-2">
          {providers.map((provider) => (
            <ProviderRow
              expandedProviderId={expandedProviderId}
              key={provider.id}
              onDeleted={handleProviderDeleted}
              onToggle={handleToggleProvider}
              onUpdated={handleProviderUpdated}
              provider={provider}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <Server className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No custom providers</p>
            <p className="text-sm text-muted-foreground">
              Add an OpenAI or Anthropic compatible provider to use your own
              models
            </p>
          </div>
          <Button
            onClick={handleOpenAddProvider}
            size="sm"
            variant="outline"
          >
            <Plus className="mr-1.5 size-3.5" />
            Add your first provider
          </Button>
        </div>
      )}

      <Dialog onOpenChange={setShowAddProvider} open={showAddProvider}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Provider</DialogTitle>
          </DialogHeader>
          <ProviderForm onCreated={handleProviderCreated} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProviderRow({
  provider,
  expandedProviderId,
  onDeleted,
  onToggle,
  onUpdated,
}: {
  provider: CustomProvider;
  expandedProviderId: string | null;
  onDeleted: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdated: () => void;
}) {
  const isExpanded = expandedProviderId === provider.id;

  const handleDeleted = useCallback(() => {
    onDeleted(provider.id);
  }, [onDeleted, provider.id]);

  const handleToggle = useCallback(() => {
    onToggle(provider.id);
  }, [onToggle, provider.id]);

  return (
    <div>
      <ProviderCard
        isExpanded={isExpanded}
        onDeleted={handleDeleted}
        onToggle={handleToggle}
        onUpdated={onUpdated}
        provider={provider}
      />
      {isExpanded ? (
        <ModelManager
          hasDefaultConfig={Boolean(provider.hasDefaultConfig)}
          providerId={provider.id}
          providerKey={provider.providerKey}
        />
      ) : null}
    </div>
  );
}
