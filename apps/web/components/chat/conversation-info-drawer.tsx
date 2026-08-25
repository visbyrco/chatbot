"use client";

import { type ReactNode, useState } from "react";
import useSWR from "swr";
import { formatCost } from "@/lib/format-cost";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from "../ui/sidebar";
import { CodeIcon, FileIcon, MoreHorizontalIcon, PaperclipIcon } from "./icons";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load conversation info: ${response.status}`);
  }
  return response.json();
};

type ConversationInfo = {
  artifacts: Array<{ id: string; kind: string; title: string }>;
  attachments: Array<{ contentType: string; name: string; url: string }>;
  byModel: Array<{
    cacheMissInputTokens: number;
    cachedInputTokens: number;
    cost: number | null;
    inputTokens: number;
    model: string;
    outputTokens: number;
  }>;
  tokens: {
    cacheMissInput: number;
    cachedInput: number;
    input: number;
    output: number;
  };
  total: number | null;
  unavailableMessages: number;
  pricedMessages: number;
};

export function ConversationInfoDrawer({
  chatId,
  messageCount,
}: {
  chatId: string;
  messageCount: number;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useSWR<ConversationInfo>(
    `${BASE_PATH}/api/chat/${chatId}/cost?messages=${messageCount}`,
    fetcher
  );

  return (
    <SidebarProvider
      className="contents"
      cookieName="conversation_info_sidebar"
      defaultOpen={false}
      onOpenChange={setOpen}
      open={open}
    >
      <Sidebar mobileSheetLabel="Conversation information" side="right">
        <SidebarHeader className="border-b border-border px-5 py-5">
          <h2 className="font-semibold text-sm">Conversation information</h2>
          <p className="text-sm text-muted-foreground">
            Details about this conversation and its model usage.
          </p>
        </SidebarHeader>
        <SidebarContent className="overflow-x-hidden overflow-y-auto">
          <div className="grid gap-4 p-5 min-w-0 max-w-full overflow-hidden">
            <section className="rounded-xl border border-border bg-muted/40 p-4 min-w-0 max-w-full overflow-hidden">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Cost
                </p>
                <span className="text-xs text-muted-foreground">
                  {data?.pricedMessages ?? 0} responses
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {isLoading
                  ? "Loading..."
                  : data?.total === null
                    ? "Unavailable"
                    : formatCost(data?.total)}
              </p>
              {data?.unavailableMessages ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Pricing is unavailable for {data.unavailableMessages} response
                  {data.unavailableMessages === 1 ? "" : "s"}; total is
                  unavailable.
                </p>
              ) : null}
              {data?.tokens ? (
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/70 pt-3 text-xs">
                  <TokenStat label="Input" value={data.tokens.cacheMissInput} />
                  <TokenStat label="Output" value={data.tokens.output} />
                  <TokenStat
                    label="Cached input"
                    value={data.tokens.cachedInput}
                  />
                </div>
              ) : null}
              {data?.byModel?.length ? (
                <div className="mt-4 space-y-2 border-t border-border/70 pt-3 min-w-0 overflow-hidden">
                  {data.byModel.map((entry) => (
                    <div
                      className="flex min-w-0 items-center justify-between gap-3 text-xs overflow-hidden"
                      key={entry.model}
                    >
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {entry.model}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {entry.cost === null
                          ? "Unavailable"
                          : formatCost(entry.cost)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
            <InfoSection
              count={data?.attachments?.length ?? 0}
              icon={<PaperclipIcon size={15} />}
              title="Attachments"
            >
              {data?.attachments?.length ? (
                data.attachments.map((attachment) => (
                  <a
                    className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                    href={attachment.url}
                    key={attachment.url || attachment.name}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <FileIcon size={15} />
                    <span className="truncate">{attachment.name}</span>
                  </a>
                ))
              ) : (
                <EmptyState text="No files uploaded" />
              )}
            </InfoSection>
            <InfoSection
              count={data?.artifacts?.length ?? 0}
              icon={<CodeIcon size={15} />}
              title="Artifacts"
            >
              {data?.artifacts?.length ? (
                data.artifacts.map((artifact) => (
                  <a
                    className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                    href={`${BASE_PATH}/api/document?id=${artifact.id}`}
                    key={artifact.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <FileIcon size={15} />
                    <span className="truncate">{artifact.title}</span>
                    <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                      {artifact.kind}
                    </span>
                  </a>
                ))
              ) : (
                <EmptyState text="No artifacts created" />
              )}
            </InfoSection>
          </div>
        </SidebarContent>
      </Sidebar>
      <div className="absolute right-3 top-3 z-20">
        <SidebarTrigger
          aria-label="Conversation information"
          className="relative flex size-9 items-center justify-center rounded-xl border border-border bg-surface-container-lowest text-foreground shadow-[var(--shadow-float)] transition-colors hover:bg-primary/10 hover:text-primary active:bg-primary/15"
          data-testid="conversation-info-trigger"
        >
          <MoreHorizontalIcon />
          <span className="sr-only">Conversation information</span>
        </SidebarTrigger>
      </div>
    </SidebarProvider>
  );
}

function TokenStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function InfoSection({
  children,
  count,
  icon,
  title,
}: {
  children: ReactNode;
  count: number;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-border p-3 min-w-0 max-w-full overflow-hidden">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icon}
        <span>{title}</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-2 py-2 text-xs text-muted-foreground">{text}</p>;
}
