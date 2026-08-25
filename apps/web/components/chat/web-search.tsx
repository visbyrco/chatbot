"use client";

import { ChevronDownIcon, ExternalLink, Globe } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type WebSearchResult = {
  content: string;
  title: string;
  url: string;
};

export function WebSearchResults({
  answer,
  className,
  open,
  onOpenChange,
  query,
  results,
}: {
  answer?: string;
  className?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  results: WebSearchResult[];
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
        <Globe className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 truncate text-left text-[13px] font-medium">
          {query}
        </p>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {results.length} result{results.length === 1 ? "" : "s"}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in">
        <div className="flex flex-col gap-3 border-t border-border p-3">
          {answer ? (
            <p className="text-[13px] leading-[1.65] text-foreground">
              {answer}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {results.map((result) => (
              <a
                className="group/result flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-primary/30"
                href={result.url}
                key={result.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground group-hover/result:text-primary">
                    {result.title}
                  </span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {result.url}
                </span>
                {result.content ? (
                  <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {result.content}
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
