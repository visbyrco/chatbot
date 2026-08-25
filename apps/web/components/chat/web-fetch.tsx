"use client";

import { ChevronDownIcon, ExternalLink, Link2 } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type WebFetchResult = {
  content: string;
  contentType?: string;
  title?: string;
  url: string;
};

export function WebFetchResults({
  className,
  onOpenChange,
  open,
  result,
}: {
  className?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  result: WebFetchResult;
}) {
  return (
    <Collapsible
      className={cn(
        "group w-full overflow-hidden rounded-lg border border-border bg-foreground/5",
        className
      )}
      onOpenChange={onOpenChange}
      open={open}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5">
        <Link2 className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 truncate text-left text-[13px] font-medium">
          {result.title || result.url}
        </p>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {result.content.length} chars
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in">
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <a
            className="flex min-w-0 items-center gap-1.5 self-start rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
            href={result.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="min-w-0 truncate">{result.url}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-[13px] leading-[1.65] text-foreground">
            {result.content}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
