"use client";

import { Globe, Loader2, Trash2 } from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  CONFIGURABLE_TOOLS,
  SEARCH_PROVIDERS,
  type SearchProvider,
} from "@/lib/ai/tools/metadata";

type ToolConfig = {
  baseURL?: string;
  createdAt: string;
  enabled: boolean;
  id: string;
  provider: string;
  toolId: string;
  updatedAt: string;
  userId: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ToolsPanel() {
  const {
    data: configs,
    error,
    isLoading,
    mutate,
  } = useSWR<ToolConfig[]>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/tools`,
    fetcher
  );

  useEffect(() => {
    if (error) {
      toast({ description: "Failed to load tools", type: "error" });
    }
  }, [error]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Tools</h3>
        <p className="text-xs text-muted-foreground">
          Configure tools that need an API key before they can be used in chat.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {CONFIGURABLE_TOOLS.map((toolId) => (
            <WebSearchToolCard
              configs={configs ?? []}
              key={toolId}
              onChanged={mutate}
              toolId={toolId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WebSearchToolCard({
  configs,
  onChanged,
  toolId,
}: {
  configs: ToolConfig[];
  onChanged: () => void;
  toolId: string;
}) {
  const [provider, setProvider] = useState<SearchProvider>("tavily");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const initializedProviderRef = useRef(false);

  const config = configs.find(
    (candidate) =>
      candidate.toolId === toolId && candidate.provider === provider
  );
  const configured = !!config;

  useEffect(() => {
    if (initializedProviderRef.current || configs.length === 0) {
      return;
    }
    initializedProviderRef.current = true;
    const savedProvider = SEARCH_PROVIDERS.find((searchProvider) =>
      configs.some(
        (candidate) =>
          candidate.toolId === toolId && candidate.provider === searchProvider
      )
    );
    if (savedProvider) {
      setProvider(savedProvider);
    }
  }, [configs, toolId]);

  useEffect(() => {
    setEnabled(config?.enabled ?? false);
    setBaseURL(config?.baseURL ?? "");
  }, [config?.enabled, config?.baseURL]);

  const handleProviderChange = useCallback((value: string) => {
    setProvider(value as SearchProvider);
    setApiKey("");
  }, []);

  const handleApiKeyChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setApiKey(event.target.value);
    },
    []
  );

  const handleBaseURLChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setBaseURL(event.target.value);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!configured) {
      if (provider === "tavily" && !apiKey) {
        toast({ description: "Enter a Tavily API key first", type: "error" });
        return;
      }
      if (provider === "searxng" && !baseURL) {
        toast({ description: "Enter a SearXNG base URL first", type: "error" });
        return;
      }
    }
    setIsSaving(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/tools/${toolId}`,
        {
          body: JSON.stringify({
            provider,
            ...(apiKey ? { apiKey } : {}),
            ...(baseURL ? { baseURL } : {}),
            enabled,
          }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message ?? "Failed to save web search settings");
      }

      setApiKey("");
      onChanged();
      toast({ description: "Web search settings saved", type: "success" });
    } catch (error) {
      toast({
        description:
          error instanceof Error
            ? error.message
            : "Failed to save web search settings",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, baseURL, configured, enabled, onChanged, provider, toolId]);

  const handleDelete = useCallback(async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/tools/${toolId}?provider=${encodeURIComponent(provider)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to remove web search settings");
      }

      setApiKey("");
      setBaseURL("");
      setEnabled(false);
      onChanged();
      toast({
        description: "Web search configuration removed",
        type: "success",
      });
    } catch (error) {
      toast({
        description:
          error instanceof Error
            ? error.message
            : "Failed to remove web search settings",
        type: "error",
      });
    }
  }, [onChanged, provider, toolId]);

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-border glass-surface p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/5">
          <Globe className="size-3.5 text-muted-foreground" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium">Web search</h4>
            <Badge
              variant={
                configured ? (enabled ? "default" : "secondary") : "outline"
              }
            >
              {configured
                ? enabled
                  ? "Enabled"
                  : "Disabled"
                : "Not configured"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Search the web for up-to-date information via a configurable
            provider.
          </p>
        </div>
      </div>

      <div className="grid gap-5 border-t border-border pt-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="search-provider">Provider</Label>
          <Select onValueChange={handleProviderChange} value={provider}>
            <SelectTrigger className="w-full sm:w-64" id="search-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEARCH_PROVIDERS.map((searchProvider) => (
                <SelectItem key={searchProvider} value={searchProvider}>
                  {searchProvider.charAt(0).toUpperCase() +
                    searchProvider.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {provider === "searxng" ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="search-base-url">Search base URL</Label>
              <Input
                id="search-base-url"
                onChange={handleBaseURLChange}
                placeholder={
                  configured
                    ? "Leave blank to keep current URL"
                    : "https://searxng.example.com"
                }
                type="text"
                value={baseURL}
              />
              <p className="text-xs text-muted-foreground">
                The URL of your self-hosted SearXNG instance, e.g.
                https://searxng.example.com.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="search-api-key">API Key (optional)</Label>
              <Input
                id="search-api-key"
                onChange={handleApiKeyChange}
                placeholder={
                  configured
                    ? "Leave blank to keep current key"
                    : "Optional — blank if no key"
                }
                type="password"
                value={apiKey}
              />
              <p className="text-xs text-muted-foreground">
                Only needed if your SearXNG instance requires one. Keys are
                stored encrypted.
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="search-api-key">API Key</Label>
            <Input
              id="search-api-key"
              onChange={handleApiKeyChange}
              placeholder={
                configured ? "Leave blank to keep current key" : "tvly-..."
              }
              type="password"
              value={apiKey}
            />
            <p className="text-xs text-muted-foreground">
              Create a key at app.tavily.com. Keys are stored encrypted.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/70 px-3 py-2.5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="search-enabled">Enabled</Label>
            <p className="text-xs text-muted-foreground">
              Allow the model to search the web in chat. Requires a saved
              configuration.
            </p>
          </div>
          <Checkbox
            checked={enabled}
            data-testid="search-enabled-toggle"
            disabled={!configured}
            id="search-enabled"
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            disabled={isSaving}
            onClick={handleSave}
            size="sm"
            type="button"
          >
            {isSaving ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : null}
            Save
          </Button>
          {configured ? (
            <Button
              onClick={handleDelete}
              size="sm"
              type="button"
              variant="outline"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Remove configuration
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
