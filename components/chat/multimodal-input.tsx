"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  ArrowUpIcon,
  BrainIcon,
  EyeIcon,
  Loader2,
  WrenchIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type Dispatch,
  Fragment,
  memo,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import type {
  ChatModel,
  ModelCapabilities,
  ReasoningEffort,
} from "@/lib/ai/models.client";
import {
  getMaxSizeForFile,
  UPLOAD_LIMITS_MESSAGE,
} from "@/lib/attachment-constants";
import { syncPreference } from "@/lib/preferences-sync";
import type { Attachment, ChatMessage, VisibilityType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isValidModelIdFormat } from "@/lib/validation";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "../ai-elements/prompt-input";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { PaperclipIcon, StopIcon } from "./icons";
import { PlusMenu } from "./plus-menu";
import { PreviewAttachment } from "./preview-attachment";
import {
  type SlashCommand,
  SlashCommandMenu,
  slashCommands,
} from "./slash-commands";
import { SuggestedActions } from "./suggested-actions";
import { ToolsMenu } from "./tools-menu";

function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365;
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  selectedModelId,
  onModelChange,
  editingMessage,
  onCancelEdit,
  isLoading,
  reasoningEffort,
  setReasoningEffort,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage:
    | UseChatHelpers<ChatMessage>["sendMessage"]
    | (() => Promise<void>);
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
  isLoading?: boolean;
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (effort: ReasoningEffort) => void;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (!hasAutoFocused.current && width) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        hasAutoFocused.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [width]);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
    }
  }, [localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);

  const { data: guardModelsData } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { dedupingInterval: 3_600_000, revalidateOnFocus: false }
  );
  const modelsLoaded =
    (guardModelsData as { models?: unknown[] } | undefined)?.models !==
    undefined;
  const hasValidModel = isValidModelIdFormat(selectedModelId);
  const shouldBlockOnInvalidModel = modelsLoaded && !hasValidModel;

  const handleInput = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const val = event.target.value;
      setInput(val);

      if (val.startsWith("/") && !val.includes(" ")) {
        setSlashOpen(true);
        setSlashQuery(val.slice(1));
        setSlashIndex(0);
      } else {
        setSlashOpen(false);
      }
    },
    [setInput]
  );

  const handleSlashSelect = useCallback(
    (cmd: SlashCommand) => {
      setSlashOpen(false);
      setInput("");
      switch (cmd.action) {
        case "new":
          router.push("/");
          break;
        case "clear":
          setMessages(() => []);
          break;
        case "rename":
          toast("Rename is available from the sidebar chat menu.");
          break;
        case "model": {
          const modelBtn = document.querySelector<HTMLButtonElement>(
            "[data-testid='model-selector']"
          );
          modelBtn?.click();
          break;
        }
        case "delete":
          toast("Delete this chat?", {
            action: {
              label: "Delete",
              onClick: () => {
                fetch(
                  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat?id=${chatId}`,
                  { method: "DELETE" }
                );
                router.push("/");
                toast.success("Chat deleted");
              },
            },
          });
          break;
        case "purge":
          toast("Delete all chats?", {
            action: {
              label: "Delete all",
              onClick: () => {
                fetch(
                  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history`,
                  {
                    method: "DELETE",
                  }
                );
                router.push("/");
                toast.success("All chats deleted");
              },
            },
          });
          break;
        default:
          break;
      }
    },
    [chatId, router, setInput, setMessages]
  );

  const submitForm = useCallback(() => {
    if (shouldBlockOnInvalidModel) {
      toast.error("Please select a valid model before sending.");
      return;
    }

    window.history.pushState(
      {},
      "",
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
    );

    sendMessage({
      parts: [
        ...attachments.map((attachment) => ({
          mediaType: attachment.contentType,
          name: attachment.name,
          type: "file" as const,
          url: attachment.url,
        })),
        {
          text: input,
          type: "text",
        },
      ],
      role: "user",
    });

    setAttachments([]);
    setLocalStorageInput("");
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    shouldBlockOnInvalidModel,
  ]);

  const uploadFile = useCallback(async (file: File) => {
    const maxSize = getMaxSizeForFile({ name: file.name, type: file.type });
    if (file.size > maxSize) {
      toast.error(UPLOAD_LIMITS_MESSAGE);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/files/upload`,
        {
          body: formData,
          method: "POST",
        }
      );

      if (response.ok) {
        const data = await response.json();
        const { url, name, contentType } = data;

        return {
          contentType,
          name,
          url,
        };
      }
      if (response.status === 413) {
        toast.error(
          "File too large — server limit is 500 MB. Try a smaller file."
        );
        return;
      }
      let errorMessage = "Failed to upload file, please try again!";
      try {
        const data = await response.json();
        if (data?.error) {
          errorMessage = data.error;
        }
      } catch {
        // response was not JSON (e.g. nginx plain 413), keep default
      }
      toast.error(errorMessage);
    } catch {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch {
        toast.error("Failed to upload files");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) {
        return;
      }

      event.preventDefault();

      setUploadQueue((prev) => [...prev, "Pasted image"]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file));

        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) =>
            attachment !== undefined &&
            attachment.url !== undefined &&
            attachment.contentType !== undefined
        );

        setAttachments((curr) => [
          ...curr,
          ...(successfullyUploadedAttachments as Attachment[]),
        ]);
      } catch {
        toast.error("Failed to upload pasted image(s)");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleCancelEditMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onCancelEdit?.();
    },
    [onCancelEdit]
  );

  const handleSlashClose = useCallback(() => {
    setSlashOpen(false);
  }, []);

  const handlePromptSubmit = useCallback(() => {
    if (input.startsWith("/")) {
      const query = input.slice(1).trim();
      const cmd = slashCommands.find((c) => c.name === query);
      if (cmd) {
        handleSlashSelect(cmd);
      }
      return;
    }
    if (!input.trim() && attachments.length === 0) {
      return;
    }
    if (shouldBlockOnInvalidModel) {
      toast.error("Please select a model before sending.");
      return;
    }
    if (status === "ready" || status === "error") {
      submitForm();
    } else {
      toast.error("Please wait for the model to finish its response!");
    }
  }, [
    attachments.length,
    handleSlashSelect,
    shouldBlockOnInvalidModel,
    input,
    status,
    submitForm,
  ]);

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashOpen) {
        const filtered = slashCommands.filter((cmd) =>
          cmd.name.startsWith(slashQuery.toLowerCase())
        );
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashIndex((i) => Math.min(i + 1, filtered.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          if (filtered[slashIndex]) {
            handleSlashSelect(filtered[slashIndex]);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashOpen(false);
          return;
        }
      }
      if (e.key === "Escape" && editingMessage && onCancelEdit) {
        e.preventDefault();
        onCancelEdit();
      }
    },
    [
      editingMessage,
      handleSlashSelect,
      onCancelEdit,
      slashIndex,
      slashOpen,
      slashQuery,
    ]
  );

  return (
    <div
      className={cn("relative flex w-full flex-col gap-4 fade-up", className)}
      style={{ animationDelay: "250ms" }}
    >
      {editingMessage && onCancelEdit ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-manrope">
          <span>Editing message</span>
          <button
            className="rounded-md px-2 py-0.5 text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
            onMouseDown={handleCancelEditMouseDown}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {!editingMessage &&
        !isLoading &&
        messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
            sendMessage={sendMessage}
          />
        )}

      <input
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif,application/pdf,text/plain,text/markdown,text/csv,application/json,application/xml,text/yaml,application/yaml,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/mpeg,video/ogg,audio/mpeg,audio/wav,audio/x-wav,audio/wave,audio/webm,audio/ogg,audio/mp4,audio/flac,audio/x-flac,audio/aac,audio/x-m4a,audio/x-aac,.heic,.heif,.avif,.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml,.mp4,.webm,.mov,.avi,.mpeg,.mpg,.ogg,.ogv,.mp3,.wav,.flac,.aac,.m4a,.oga"
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <div className="relative">
        {slashOpen ? (
          <SlashCommandMenu
            onClose={handleSlashClose}
            onSelect={handleSlashSelect}
            query={slashQuery}
            selectedIndex={slashIndex}
          />
        ) : null}
      </div>

      <PromptInput
        className="[&>div]:rounded-xl [&>div]:border [&>div]:border-input [&>div]:bg-card [&>div]:shadow-[var(--shadow-composer)] [&>div]:transition-all [&>div]:duration-300 dark:[&>div]:border-white/10 dark:[&>div]:bg-white/[0.07] dark:[&>div]:focus-within:border-primary/30 dark:[&>div]:focus-within:bg-white/[0.09] [&_[data-slot='input-group-addon'][data-align='block-end']]:!border-t-0 [&_[data-slot='input-group-addon'][data-align='block-end']]:border-t-0"
        onSubmit={handlePromptSubmit}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex w-full self-start flex-row gap-2 overflow-x-auto px-3 pt-3 no-scrollbar"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <AttachmentPreviewItem
                attachment={attachment}
                fileInputRef={fileInputRef}
                key={attachment.url}
                setAttachments={setAttachments}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  contentType: "",
                  name: filename,
                  url: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </div>
        )}
        <PromptInputTextarea
          className="min-h-24 text-[14px] leading-relaxed px-4 pt-3.5 pb-1.5 placeholder:text-muted-foreground/55"
          data-testid="multimodal-input"
          onChange={handleInput}
          onKeyDown={handleTextareaKeyDown}
          placeholder={
            editingMessage ? "Edit your message..." : "Ask anything..."
          }
          ref={textareaRef}
          value={input}
        />
        <PromptInputFooter className="border-t-0 !border-t-0 px-3 pb-3">
          <PromptInputTools>
            <PlusMenu
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
              status={status}
            />
            <div className="hidden min-w-0 items-center gap-1 md:flex">
              <AttachmentsButton
                fileInputRef={fileInputRef}
                selectedModelId={selectedModelId}
                status={status}
              />
              <ToolsMenu selectedModelId={selectedModelId} />
            </div>
          </PromptInputTools>

          <div className="ml-auto flex items-center gap-2">
            <ModelSelectorCompact
              onModelChange={onModelChange}
              preserveComposerFocus
              reasoningEffort={reasoningEffort}
              selectedModelId={selectedModelId}
              setReasoningEffort={setReasoningEffort}
            />
            {status === "submitted" || status === "streaming" ? (
              <StopButton setMessages={setMessages} stop={stop} />
            ) : (
              <PromptInputSubmit
                className={cn(
                  "h-7 w-7 shrink-0 rounded-lg transition-all duration-200",
                  input.trim() && !shouldBlockOnInvalidModel
                    ? "bg-foreground text-background hover:opacity-85 active:scale-95"
                    : "bg-foreground/5 text-muted-foreground/25 cursor-not-allowed"
                )}
                data-testid="send-button"
                disabled={
                  !input.trim() ||
                  uploadQueue.length > 0 ||
                  shouldBlockOnInvalidModel
                }
                status={status}
                variant="secondary"
              >
                <ArrowUpIcon className="size-4" />
              </PromptInputSubmit>
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }
    if (prevProps.editingMessage !== nextProps.editingMessage) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.messages.length !== nextProps.messages.length) {
      return false;
    }
    if (prevProps.reasoningEffort !== nextProps.reasoningEffort) {
      return false;
    }
    if (prevProps.className !== nextProps.className) {
      return false;
    }
    if (prevProps.chatId !== nextProps.chatId) {
      return false;
    }
    if (prevProps.setInput !== nextProps.setInput) {
      return false;
    }
    if (prevProps.stop !== nextProps.stop) {
      return false;
    }
    if (prevProps.sendMessage !== nextProps.sendMessage) {
      return false;
    }
    if (prevProps.onModelChange !== nextProps.onModelChange) {
      return false;
    }
    if (prevProps.setAttachments !== nextProps.setAttachments) {
      return false;
    }
    if (prevProps.setMessages !== nextProps.setMessages) {
      return false;
    }
    if (prevProps.setReasoningEffort !== nextProps.setReasoningEffort) {
      return false;
    }
    if (prevProps.onCancelEdit !== nextProps.onCancelEdit) {
      return false;
    }
    // width is derived via useWindowSize inside the component and triggers
    // internal re-render; no prop comparison needed but included for completeness

    return true;
  }
);

function PureAttachmentPreviewItem({
  attachment,
  fileInputRef,
  setAttachments,
}: {
  attachment: Attachment;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
}) {
  const handleRemove = useCallback(() => {
    setAttachments((currentAttachments) =>
      currentAttachments.filter((a) => a.url !== attachment.url)
    );
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [attachment.url, fileInputRef, setAttachments]);

  return <PreviewAttachment attachment={attachment} onRemove={handleRemove} />;
}

const AttachmentPreviewItem = memo(PureAttachmentPreviewItem);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const { data: modelsResponse } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { dedupingInterval: 3_600_000, revalidateOnFocus: false }
  );

  const caps: Record<string, ModelCapabilities> | undefined =
    modelsResponse?.capabilities ?? modelsResponse;
  const hasVision = caps?.[selectedModelId]?.vision ?? false;
  const attachmentLabel = hasVision
    ? "Attach image or file"
    : "Attach file (images need a vision model)";
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      fileInputRef.current?.click();
    },
    [fileInputRef]
  );
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (window.matchMedia("(max-width: 767px)").matches) {
        event.preventDefault();
      }
    },
    []
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={attachmentLabel}
          className="h-7 w-7 rounded-md border border-input bg-foreground/5 p-1 text-foreground transition-all hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
          data-testid="attachments-button"
          disabled={status !== "ready"}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          title={attachmentLabel}
          variant="ghost"
        >
          <PaperclipIcon size={14} style={{ height: 14, width: 14 }} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {attachmentLabel}
      </TooltipContent>
    </Tooltip>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

const reasoningEffortValues = new Set<ReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

function getReasoningEfforts(
  capabilities: Record<string, ModelCapabilities> | undefined,
  modelId: string
): ReasoningEffort[] {
  return Array.from(
    new Set(
      (capabilities?.[modelId]?.reasoningEfforts ?? []).filter(
        (effort): effort is ReasoningEffort =>
          reasoningEffortValues.has(effort as ReasoningEffort)
      )
    )
  );
}

function ModelSelectorOption({
  capabilities,
  isPending,
  model,
  onSelectModel,
  selectedModelId,
}: {
  capabilities: Record<string, ModelCapabilities> | undefined;
  isPending: boolean;
  model: ChatModel;
  onSelectModel: (model: ChatModel) => void;
  selectedModelId: string;
}) {
  const logoProvider = model.providerKey ?? model.id.split("/")[0];
  const maybeWithTooltip = (icon: ReactNode, label: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{icon}</span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
  const handleSelect = useCallback(
    () => onSelectModel(model),
    [model, onSelectModel]
  );

  return (
    <ModelSelectorItem
      aria-current={model.id === selectedModelId ? "true" : undefined}
      className={cn(
        "flex w-full py-2.5 transition-[background-color,color,box-shadow]",
        isPending &&
          "bg-primary/8 text-foreground ring-1 ring-inset ring-primary/20 data-[selected=true]:bg-primary/10"
      )}
      onSelect={handleSelect}
      value={model.id}
    >
      <ModelSelectorLogo provider={logoProvider} />
      <ModelSelectorName className={cn(isPending && "font-medium")}>
        {model.name}
      </ModelSelectorName>
      {isPending ? (
        <span className="ml-auto rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">
          Confirm
        </span>
      ) : (
        <div className="ml-auto flex items-center gap-2 text-foreground/70">
          {capabilities?.[model.id]?.tools
            ? maybeWithTooltip(
                <WrenchIcon className="size-3.5" />,
                "Supports tool use"
              )
            : null}
          {capabilities?.[model.id]?.vision
            ? maybeWithTooltip(
                <EyeIcon className="size-3.5" />,
                "Supports vision"
              )
            : null}
          {capabilities?.[model.id]?.reasoning
            ? maybeWithTooltip(
                <BrainIcon className="size-3.5" />,
                "Supports reasoning"
              )
            : null}
        </div>
      )}
    </ModelSelectorItem>
  );
}

function ReasoningEffortPicker({
  efforts,
  modelName,
  onCommit,
  onPreview,
  value,
}: {
  efforts: ReasoningEffort[];
  modelName: string;
  onCommit: (effort: ReasoningEffort) => void;
  onPreview: (effort: ReasoningEffort) => void;
  value: ReasoningEffort;
}) {
  const options = useMemo<ReasoningEffort[]>(
    () => ["default", ...efforts],
    [efforts]
  );
  const selectedIndex = Math.max(0, options.indexOf(value));
  const handleSliderChange = useCallback(
    ([index]: number[]) => {
      const effort = options[index];
      if (effort) {
        onPreview(effort);
      }
    },
    [onPreview, options]
  );
  const handleSliderCommit = useCallback(
    ([index]: number[]) => {
      const effort = options[index];
      if (effort) {
        onCommit(effort);
      }
    },
    [onCommit, options]
  );
  const handleOptionClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const effort = event.currentTarget.dataset.effort as
        | ReasoningEffort
        | undefined;
      if (effort) {
        onCommit(effort);
      }
    },
    [onCommit]
  );
  const handleSliderKeyDown = useCallback(
    (event: React.KeyboardEvent) => event.stopPropagation(),
    []
  );

  return (
    <fieldset
      aria-label={`Reasoning effort for ${modelName}`}
      className="mx-1 mb-2 mt-1 rounded-lg border border-border bg-muted/60 px-3 pb-3 pt-2.5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_4%,transparent)]"
      data-testid="reasoning-effort-picker"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 font-manrope text-[11px] font-bold uppercase tracking-wider text-foreground">
            <BrainIcon className="size-3.5 text-primary" />
            Reasoning effort
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            Select an effort to apply it.
          </p>
        </div>
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-primary ring-1 ring-primary/20">
          {value}
        </span>
      </div>
      <Slider
        aria-label="Reasoning effort"
        className="py-1"
        max={options.length - 1}
        min={0}
        onKeyDown={handleSliderKeyDown}
        onValueChange={handleSliderChange}
        onValueCommit={handleSliderCommit}
        step={1}
        value={[selectedIndex]}
      />
      <div
        className="mt-2 grid"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((effort, index) => {
          const active = value === effort;
          return (
            <button
              aria-label={`Set reasoning effort to ${effort}`}
              aria-pressed={active}
              className={cn(
                "relative flex min-w-0 cursor-pointer flex-col items-center gap-1 text-[9px] capitalize transition-colors font-manrope",
                active
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-effort={effort}
              key={effort}
              onClick={handleOptionClick}
              type="button"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-md border transition-colors",
                  active
                    ? "border-primary bg-primary glow-primary"
                    : "border-foreground/20 bg-foreground/5",
                  index === 0 && "rounded-lg"
                )}
              />
              <span className="max-w-full truncate">{effort}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
  reasoningEffort,
  setReasoningEffort,
  defaultLabel,
  modelCookieName = "chat-model",
  preserveComposerFocus = false,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  defaultLabel?: string;
  modelCookieName?: string;
  preserveComposerFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [draftReasoningEffort, setDraftReasoningEffort] =
    useState<ReasoningEffort>("default");
  const { data: modelsData, isLoading } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { dedupingInterval: 3_600_000, revalidateOnFocus: false }
  );

  const capabilities: Record<string, ModelCapabilities> | undefined =
    modelsData?.capabilities ?? modelsData;
  const dynamicModels: ChatModel[] | undefined = modelsData?.models;
  const providerNames: Record<string, string> = modelsData?.providerNames ?? {};
  const activeModels = dynamicModels ?? [];

  const isDefaultSelected =
    defaultLabel !== undefined &&
    (selectedModelId === "" ||
      !activeModels.some((m: ChatModel) => m.id === selectedModelId));

  const selectedModel = isDefaultSelected
    ? null
    : (activeModels.find((m: ChatModel) => m.id === selectedModelId) ??
      activeModels[0]);
  const provider = selectedModel
    ? (selectedModel.providerKey ?? selectedModel.id.split("/")[0])
    : undefined;
  const pendingModel = activeModels.find(
    (model: ChatModel) => model.id === pendingModelId
  );
  const pendingReasoningEfforts = pendingModel
    ? getReasoningEfforts(capabilities, pendingModel.id)
    : [];

  const prevOpenRef = useRef(false);
  const hasOpenedRef = useRef(false);

  // Reopening the picker for an already-selected reasoning model should show
  // its effort picker right away, so changing the effort is a direct action
  // instead of having to re-select the model first. The first open is left
  // alone so the user can browse and pick a model.
  useEffect(() => {
    const isOpening = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!isOpening) {
      return;
    }
    const isReopen = hasOpenedRef.current;
    hasOpenedRef.current = true;
    if (!isReopen) {
      return;
    }
    const efforts = selectedModel
      ? getReasoningEfforts(capabilities, selectedModel.id)
      : [];
    if (efforts.length > 1 && selectedModel) {
      setPendingModelId(selectedModel.id);
      setDraftReasoningEffort(reasoningEffort);
    }
  }, [open, capabilities, selectedModel, reasoningEffort]);

  const focusChatInput = useCallback(() => {
    setTimeout(() => {
      document
        .querySelector<HTMLTextAreaElement>("[data-testid='multimodal-input']")
        ?.focus();
    }, 50);
  }, []);

  const handlePreserveComposerPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!preserveComposerFocus) {
        return;
      }
      if (!window.matchMedia("(max-width: 767px)").matches) {
        return;
      }

      const target = event.target as Element;
      if (!target.closest("input, textarea, select")) {
        event.preventDefault();
      }
    },
    [preserveComposerFocus]
  );

  const handlePreserveComposerClick = useCallback(() => {
    if (!preserveComposerFocus) {
      return;
    }
    if (!window.matchMedia("(max-width: 767px)").matches) {
      return;
    }

    requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>("[data-slot='command-input']")
        ?.focus();
    });
  }, [preserveComposerFocus]);

  const handleCloseAutoFocus = useCallback(
    (event: Event) => {
      if (!preserveComposerFocus) {
        return;
      }
      event.preventDefault();
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLTextAreaElement>(
            "[data-testid='multimodal-input']"
          )
          ?.focus();
      });
    },
    [preserveComposerFocus]
  );

  const commitModel = useCallback(
    (modelId: string, effort: ReasoningEffort) => {
      onModelChange?.(modelId);
      setReasoningEffort(effort);
      setCookie(modelCookieName, modelId);
      syncPreference(
        modelCookieName === "title-model" ? "titleModelId" : "chatModelId"
      );
      setOpen(false);
      setPendingModelId(null);
      setDraftReasoningEffort("default");
      focusChatInput();
    },
    [focusChatInput, modelCookieName, onModelChange, setReasoningEffort]
  );

  const handleModelSelect = useCallback(
    (model: ChatModel) => {
      const efforts = getReasoningEfforts(capabilities, model.id);
      if (efforts.length <= 1) {
        commitModel(model.id, "default");
        return;
      }

      if (pendingModelId === model.id) {
        commitModel(model.id, draftReasoningEffort);
        return;
      }

      setPendingModelId(model.id);
      setDraftReasoningEffort(reasoningEffort);
    },
    [
      capabilities,
      commitModel,
      draftReasoningEffort,
      pendingModelId,
      reasoningEffort,
    ]
  );

  const handleCommitEffort = useCallback(
    (effort: ReasoningEffort) => {
      if (pendingModelId) {
        commitModel(pendingModelId, effort);
      }
    },
    [commitModel, pendingModelId]
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setPendingModelId(null);
      setDraftReasoningEffort("default");
    }
  }, []);

  const handleDefaultSelect = useCallback(() => {
    commitModel("", "default");
  }, [commitModel]);

  if (isLoading) {
    return (
      <Button
        className="h-7 max-w-[200px] justify-between gap-1.5 rounded-md border border-input bg-foreground/4 px-2 text-[12px] text-muted-foreground"
        data-testid="model-selector"
        disabled
        variant="ghost"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <ModelSelectorName>Loading...</ModelSelectorName>
      </Button>
    );
  }

  if (activeModels.length === 0) {
    return (
      <Button
        className="h-7 max-w-[200px] justify-between gap-1.5 rounded-md border border-input bg-foreground/4 px-2 text-[12px] text-muted-foreground"
        data-testid="model-selector"
        disabled
        variant="ghost"
      >
        <ModelSelectorName>No models available</ModelSelectorName>
      </Button>
    );
  }

  const selectedModelName = selectedModel?.name ?? null;

  return (
    <ModelSelector onOpenChange={handleOpenChange} open={open}>
      <ModelSelectorTrigger asChild>
        <Button
          className="h-7 justify-between gap-1.5 rounded-md border border-input bg-foreground/4 px-2 text-[12px] text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
          data-testid="model-selector"
          onPointerDown={
            preserveComposerFocus
              ? handlePreserveComposerPointerDown
              : undefined
          }
          variant="ghost"
        >
          {isDefaultSelected ? (
            <ModelSelectorName>{defaultLabel}</ModelSelectorName>
          ) : (
            <>
              {provider ? <ModelSelectorLogo provider={provider} /> : null}
              <ModelSelectorName>{selectedModelName}</ModelSelectorName>
              {reasoningEffort === "default" ? null : (
                <Badge
                  className="h-4 rounded px-1.5 text-[10px] font-medium"
                  variant="outline"
                >
                  {reasoningEffort.charAt(0).toUpperCase() +
                    reasoningEffort.slice(1)}
                </Badge>
              )}
            </>
          )}
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent
        className="max-h-[min(360px,calc(var(--visual-viewport-height,100vh)-132px))] w-[min(360px,calc(100vw-24px))] overflow-hidden"
        collisionPadding={16}
        commandDefaultValue={
          isDefaultSelected ? "default" : (selectedModel?.id ?? "default")
        }
        onClickCapture={
          preserveComposerFocus ? handlePreserveComposerClick : undefined
        }
        onCloseAutoFocus={
          preserveComposerFocus ? handleCloseAutoFocus : undefined
        }
      >
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          {defaultLabel ? (
            <ModelSelectorItem
              aria-current={isDefaultSelected ? "true" : undefined}
              className={cn(
                "flex w-full py-2.5 transition-[background-color,color,box-shadow]"
              )}
              onSelect={handleDefaultSelect}
              value="default"
            >
              <ModelSelectorName className="flex-1 truncate text-left">
                {defaultLabel}
              </ModelSelectorName>
            </ModelSelectorItem>
          ) : null}
          {(() => {
            const grouped: Record<string, ChatModel[]> = {};
            for (const model of activeModels) {
              const key = model.provider;
              if (!grouped[key]) {
                grouped[key] = [];
              }
              grouped[key].push(model);
            }

            const sortedKeys = Object.keys(grouped).sort((a, b) =>
              a.localeCompare(b)
            );

            return sortedKeys.map((key) => (
              <ModelSelectorGroup heading={providerNames[key] ?? key} key={key}>
                {grouped[key].map((model) => (
                  <Fragment key={model.id}>
                    <ModelSelectorOption
                      capabilities={capabilities}
                      isPending={model.id === pendingModelId}
                      model={model}
                      onSelectModel={handleModelSelect}
                      selectedModelId={selectedModel?.id ?? ""}
                    />
                    {model.id === pendingModelId &&
                    pendingReasoningEfforts.length > 1 ? (
                      <ReasoningEffortPicker
                        efforts={pendingReasoningEfforts}
                        modelName={model.name}
                        onCommit={handleCommitEffort}
                        onPreview={setDraftReasoningEffort}
                        value={draftReasoningEffort}
                      />
                    ) : null}
                  </Fragment>
                ))}
              </ModelSelectorGroup>
            ));
          })()}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

export const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      stop();
      setMessages((messages) => messages);
    },
    [setMessages, stop]
  );

  return (
    <Button
      className="h-7 w-7 shrink-0 rounded-md bg-primary p-1 text-primary-foreground transition-all duration-200 glow-primary hover:brightness-110 active:scale-95 disabled:bg-foreground/5 disabled:text-muted-foreground/25 disabled:cursor-not-allowed"
      data-testid="stop-button"
      onClick={handleClick}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
