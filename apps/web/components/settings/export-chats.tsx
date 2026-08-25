"use client";

import { format } from "date-fns";
import { zipSync } from "fflate";
import { Download, Inbox } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";

type ExportChat = {
  createdAt: string;
  id: string;
  messageCount: number;
  title: string;
};

type ExportItem = {
  filename: string;
  id: string;
  markdown: string;
};

type ExportResponse = {
  exports: ExportItem[];
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Request failed");
  }
  return response.json();
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ChatRow({
  chat,
  isChecked,
  onToggle,
}: {
  chat: ExportChat;
  isChecked: boolean;
  onToggle: (id: string) => void;
}) {
  const handleCheckedChange = useCallback(() => {
    onToggle(chat.id);
  }, [chat.id, onToggle]);

  return (
    <label
      className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-foreground/5"
      htmlFor={`export-chat-${chat.id}`}
    >
      <Checkbox
        checked={isChecked}
        id={`export-chat-${chat.id}`}
        onCheckedChange={handleCheckedChange}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{chat.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {format(new Date(chat.createdAt), "PP")} · {chat.messageCount} message
          {chat.messageCount === 1 ? "" : "s"}
        </p>
      </div>
    </label>
  );
}

export function ExportChats() {
  const { data, error, isLoading } = useSWR<{ chats: ExportChat[] }>(
    `${BASE_PATH}/api/export`,
    fetcher
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isExporting, setIsExporting] = useState(false);

  const chats = data?.chats ?? [];
  const allSelected = chats.length > 0 && selectedIds.size === chats.length;

  const handleToggleChat = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds(
      allSelected ? new Set() : new Set(chats.map((chat) => chat.id))
    );
  }, [allSelected, chats]);

  const handleExport = useCallback(async (chatIds: string[] | undefined) => {
    setIsExporting(true);
    try {
      const response = await fetch(`${BASE_PATH}/api/export`, {
        body: JSON.stringify(chatIds ? { chatIds } : {}),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast({
          description: body?.message ?? "Export failed",
          type: "error",
        });
        return;
      }

      const result = (await response.json()) as ExportResponse;
      const exports = result.exports ?? [];

      if (exports.length === 0) {
        toast({ description: "No chats to export", type: "error" });
        return;
      }

      if (exports.length === 1) {
        const [item] = exports;
        downloadBlob(
          new Blob([item.markdown], {
            type: "text/markdown;charset=utf-8",
          }),
          item.filename
        );
      } else {
        const files: Record<string, Uint8Array> = {};
        for (const item of exports) {
          files[item.filename] = new TextEncoder().encode(item.markdown);
        }
        const zipped = zipSync(files);
        const date = format(new Date(), "yyyy-MM-dd");
        downloadBlob(
          new Blob([zipped], { type: "application/zip" }),
          `chatbot-export-${date}.zip`
        );
      }

      toast({
        description: `Exported ${exports.length} chat${exports.length === 1 ? "" : "s"}`,
        type: "success",
      });
    } catch {
      toast({ description: "Export failed", type: "error" });
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleExportSelected = useCallback(() => {
    handleExport([...selectedIds]);
  }, [handleExport, selectedIds]);

  const handleExportAll = useCallback(() => {
    handleExport(undefined);
  }, [handleExport]);

  useEffect(() => {
    if (error) {
      toast({ description: "Failed to load chats", type: "error" });
    }
  }, [error]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Export Chats</h2>
          <p className="text-sm text-muted-foreground">
            Download your conversations as markdown files.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={isExporting || selectedIds.size === 0}
            onClick={handleExportSelected}
            size="sm"
          >
            <Download className="mr-1.5 size-3.5" />
            Export selected ({selectedIds.size})
          </Button>
          <Button
            disabled={isExporting || chats.length === 0}
            onClick={handleExportAll}
            size="sm"
            variant="outline"
          >
            Export all
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : chats.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No chats to export</p>
            <p className="text-sm text-muted-foreground">
              Your conversations will appear here once you start chatting
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <Checkbox
              checked={allSelected}
              id="export-select-all"
              onCheckedChange={handleToggleAll}
            />
            <label
              className="cursor-pointer select-none"
              htmlFor="export-select-all"
            >
              Select all
            </label>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl border p-1.5">
            {chats.map((chat) => (
              <ChatRow
                chat={chat}
                isChecked={selectedIds.has(chat.id)}
                key={chat.id}
                onToggle={handleToggleChat}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
