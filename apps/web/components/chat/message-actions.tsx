import { memo, useCallback } from "react";
import { toast } from "sonner";
import { useCopyToClipboard } from "usehooks-ts";
import { useStatsForNerds } from "@/lib/stats-for-nerds";
import type { ChatMessage } from "@/lib/types";
import {
  MessageAction as Action,
  MessageActions as Actions,
} from "../ai-elements/message";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Separator } from "../ui/separator";
import {
  CopyIcon,
  GitForkIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilEditIcon,
} from "./icons";
import { getMessageNerdStats, type MessageNerdStats } from "./message-stats";

export function PureMessageActions({
  message,
  isLoading,
  onEdit,
  onFork,
}: {
  message: ChatMessage;
  isLoading: boolean;
  onEdit?: () => void;
  onFork?: () => void;
}) {
  const [_, copyToClipboard] = useCopyToClipboard();
  const statsForNerds = useStatsForNerds();
  const stats = getMessageNerdStats(message, statsForNerds);
  const { modelName, reasoningEffort } = message.metadata ?? {};

  const textFromParts = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  const handleCopy = useCallback(async () => {
    if (!textFromParts) {
      toast.error("There's no text to copy!");
      return;
    }

    await copyToClipboard(textFromParts);
    toast.success("Copied to clipboard!");
  }, [copyToClipboard, textFromParts]);

  const handleStatsSelect = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  if (isLoading) {
    return null;
  }

  if (message.role === "user") {
    return (
      <Actions className="-mr-0.5 justify-end">
        <div className="hidden items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 md:flex">
          {onEdit ? (
            <Action
              className="size-7 text-muted-foreground/50 hover:text-foreground"
              data-testid="message-edit-button"
              onClick={onEdit}
              tooltip="Edit"
            >
              <PencilEditIcon />
            </Action>
          ) : null}
          <Action
            className="size-7 text-muted-foreground/50 hover:text-foreground"
            onClick={handleCopy}
            tooltip="Copy"
          >
            <CopyIcon />
          </Action>
        </div>
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Message actions"
                className="relative size-11 text-muted-foreground/60 after:absolute after:-inset-[6px] md:after:hidden"
                data-testid="message-actions-mobile-trigger"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <MoreHorizontalIcon />
                <span className="sr-only">Message actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-56"
              data-testid="message-actions-menu"
            >
              {onEdit ? (
                <DropdownMenuItem
                  className="cursor-pointer"
                  data-testid="message-edit-mobile"
                  onClick={onEdit}
                >
                  <PencilEditIcon />
                  <span>Edit</span>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="cursor-pointer"
                data-testid="message-copy-mobile"
                onClick={handleCopy}
              >
                <CopyIcon />
                <span>Copy</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Actions>
    );
  }

  return (
    <Actions className="-ml-0.5">
      <div className="hidden min-w-0 flex-1 items-center opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 md:flex">
        <Action
          className="text-muted-foreground/50 hover:text-foreground"
          onClick={handleCopy}
          tooltip="Copy"
        >
          <CopyIcon />
        </Action>

        {onFork ? (
          <Action
            className="text-muted-foreground/50 hover:text-foreground"
            data-testid="message-fork"
            onClick={onFork}
            tooltip="Fork conversation"
          >
            <GitForkIcon />
          </Action>
        ) : null}

        {stats ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                aria-label="Stats for nerds"
                className="text-muted-foreground/50 hover:text-foreground"
                data-testid="message-stats-button"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <InfoIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[min(16rem,calc(100vw-1rem))] p-3 text-xs"
            >
              <NerdStatsContent
                modelName={modelName}
                reasoningEffort={reasoningEffort}
                stats={stats}
              />
            </PopoverContent>
          </Popover>
        ) : null}

        {modelName ? (
          <span
            className="ml-1 min-w-0 flex-1 truncate text-[11px] leading-4 text-muted-foreground/70"
            data-testid="message-model-label"
          >
            {modelName}
            {reasoningEffort ? <> · {reasoningEffort}</> : null}
          </span>
        ) : null}
      </div>
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Message actions"
              className="relative size-11 text-muted-foreground/60 after:absolute after:-inset-[6px] md:after:hidden"
              data-testid="message-actions-mobile-trigger"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreHorizontalIcon />
              <span className="sr-only">Message actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56"
            data-testid="message-actions-menu"
          >
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="message-copy-mobile"
              onClick={handleCopy}
            >
              <CopyIcon />
              <span>Copy</span>
            </DropdownMenuItem>
            {onFork ? (
              <DropdownMenuItem
                className="cursor-pointer"
                data-testid="message-fork-mobile"
                onClick={onFork}
              >
                <GitForkIcon />
                <span>Fork conversation</span>
              </DropdownMenuItem>
            ) : null}
            {stats ? (
              <Popover>
                <PopoverTrigger asChild>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    data-testid="message-stats-menu-item"
                    onSelect={handleStatsSelect}
                  >
                    <InfoIcon />
                    <span>Stats for nerds</span>
                  </DropdownMenuItem>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(16rem,calc(100vw-1rem))] p-3 text-xs"
                  side="bottom"
                >
                  <NerdStatsContent
                    modelName={modelName}
                    reasoningEffort={reasoningEffort}
                    stats={stats}
                  />
                </PopoverContent>
              </Popover>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Actions>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  const displayValue =
    typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{displayValue}</span>
    </div>
  );
}

function NerdStatsContent({
  stats,
  modelName,
  reasoningEffort,
}: {
  stats: MessageNerdStats;
  modelName?: string;
  reasoningEffort?: string;
}) {
  return (
    <div className="grid gap-1" data-testid="message-stats-content">
      {modelName ? (
        <>
          <div className="flex min-w-0 items-center justify-between gap-4 pb-1">
            <span className="text-muted-foreground">Model</span>
            <span className="min-w-0 truncate text-right font-medium">
              {modelName}
              {reasoningEffort ? ` · ${reasoningEffort}` : null}
            </span>
          </div>
          <Separator />
        </>
      ) : null}
      <StatRow label="Tokens / second" value={stats.tokensPerSecond} />
      <StatRow
        label="Time to first token"
        value={`${stats.timeToFirstToken} s`}
      />
      <StatRow label="Input tokens" value={stats.inputTokens} />
      <StatRow
        label="Cache hit input tokens"
        value={stats.cacheHitInputTokens}
      />
      <StatRow
        label="Cache miss input tokens"
        value={stats.cacheMissInputTokens}
      />
      <StatRow label="Output tokens" value={stats.outputTokens} />
      <StatRow label="Reasoning tokens" value={stats.reasoningTokens} />
      <StatRow label="Cost" value={stats.cost} />
    </div>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => prevProps.isLoading === nextProps.isLoading
);
