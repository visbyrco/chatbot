"use client";

import { format } from "date-fns";
import { Download, Paperclip } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";

type Attachment = {
  chatId: string;
  chatTitle: string;
  id: string;
  mediaType: string;
  messageCreatedAt: string;
  name: string;
  url: string;
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

function AttachmentRow({
  attachment,
  isChecked,
  onToggle,
}: {
  attachment: Attachment;
  isChecked: boolean;
  onToggle: (id: string) => void;
}) {
  const handleCheckedChange = useCallback(() => {
    onToggle(attachment.id);
  }, [attachment.id, onToggle]);

  return (
    <label
      className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-foreground/5"
      htmlFor={`export-attachment-${attachment.id}`}
    >
      <Checkbox
        checked={isChecked}
        id={`export-attachment-${attachment.id}`}
        onCheckedChange={handleCheckedChange}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {attachment.chatTitle} ·{" "}
          {format(new Date(attachment.messageCreatedAt), "PP")}
          {attachment.mediaType ? ` · ${attachment.mediaType}` : ""}
        </p>
      </div>
    </label>
  );
}

export function ExportAttachments() {
  const { data, error, isLoading } = useSWR<{ attachments: Attachment[] }>(
    `${BASE_PATH}/api/export/attachments`,
    fetcher
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isExporting, setIsExporting] = useState(false);

  const attachments = data?.attachments ?? [];
  const allSelected =
    attachments.length > 0 && selectedIds.size === attachments.length;

  const handleToggleAttachment = useCallback((id: string) => {
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
      allSelected
        ? new Set()
        : new Set(attachments.map((attachment) => attachment.id))
    );
  }, [allSelected, attachments]);

  const handleExport = useCallback(
    async (attachmentIds: string[] | undefined) => {
      setIsExporting(true);
      try {
        const response = await fetch(`${BASE_PATH}/api/export/attachments`, {
          body: JSON.stringify(attachmentIds ? { attachmentIds } : {}),
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

        const blob = await response.blob();
        const count = Number.parseInt(
          response.headers.get("X-Exported-Count") ?? "0",
          10
        );
        const date = format(new Date(), "yyyy-MM-dd");
        downloadBlob(blob, `chatbot-attachments-${date}.zip`);

        if (count === 0) {
          toast({
            description: "No attachments could be exported",
            type: "error",
          });
        } else {
          toast({
            description: `Exported ${count} attachment${count === 1 ? "" : "s"}`,
            type: "success",
          });
        }
      } catch {
        toast({ description: "Export failed", type: "error" });
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  const handleExportSelected = useCallback(() => {
    handleExport([...selectedIds]);
  }, [handleExport, selectedIds]);

  const handleExportAll = useCallback(() => {
    handleExport(undefined);
  }, [handleExport]);

  useEffect(() => {
    if (error) {
      toast({ description: "Failed to load attachments", type: "error" });
    }
  }, [error]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Export Attachments</h2>
          <p className="text-sm text-muted-foreground">
            Download the files you&apos;ve attached to your chats.
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
            disabled={isExporting || attachments.length === 0}
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
      ) : attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
          <Paperclip className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No attachments to export</p>
            <p className="text-sm text-muted-foreground">
              Files you attach to messages will appear here
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <Checkbox
              checked={allSelected}
              id="export-attachments-select-all"
              onCheckedChange={handleToggleAll}
            />
            <label
              className="cursor-pointer select-none"
              htmlFor="export-attachments-select-all"
            >
              Select all
            </label>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl border p-1.5">
            {attachments.map((attachment) => (
              <AttachmentRow
                attachment={attachment}
                isChecked={selectedIds.has(attachment.id)}
                key={attachment.id}
                onToggle={handleToggleAttachment}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
