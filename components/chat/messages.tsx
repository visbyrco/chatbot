import type { UseChatHelpers } from "@ai-sdk/react";
import { motion } from "framer-motion";
import { ArrowDownIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMessages } from "@/hooks/use-messages";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Greeting } from "./greeting";
import { CopyIcon } from "./icons";
import { PreviewMessage, ThinkingMessage } from "./message";

type MessagesProps = {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  bottomClearance?: number;
  chatError?: Error;
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  isLoading?: boolean;
  selectedModelId: string;
  onEditMessage?: (message: ChatMessage) => void;
  onForkMessage?: (message: ChatMessage) => void;
};

function ChatErrorCard({
  chatId,
  error,
  modelId,
  onRetry,
}: {
  chatId: string;
  error: Error;
  modelId: string;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const message = error.message || "The request failed without details.";
  const details = useMemo(
    () =>
      [
        `Chat: ${chatId}`,
        `Model: ${modelId || "unknown"}`,
        `Time: ${new Date().toISOString()}`,
        `Error: ${message}`,
      ].join("\n"),
    [chatId, modelId, message]
  );
  const handleCopy = useCallback(() => {
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(details).then(done, () => undefined);
    }
  }, [details]);

  return (
    <div
      className="rounded-lg border border-error/20 bg-error/10 p-4 text-error"
      data-testid="chat-error"
      role="alert"
    >
      <div className="flex items-center gap-2 font-medium">
        <TriangleAlertIcon className="size-4 shrink-0" />
        Couldn&apos;t get a response
      </div>
      <p className="mt-2 text-sm leading-6 break-words text-foreground">
        {message}
      </p>
      {modelId ? (
        <p className="mt-1 text-xs text-muted-foreground">Model: {modelId}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <RotateCcwIcon className="size-3.5" />
          Retry
        </Button>
        <Button onClick={handleCopy} size="sm" type="button" variant="ghost">
          <CopyIcon size={14} />
          {copied ? "Copied" : "Copy details"}
        </Button>
      </div>
    </div>
  );
}

// Fixed estimate: lightweight heuristic for 500+ message windowing.
// It drifts for variable-height content (code blocks, images, tool outputs).
// For precise virtualization, replace with dynamic measurement
// (ResizeObserver per row or @tanstack/react-virtual).
const VIRTUALIZATION_THRESHOLD = 100;
const ESTIMATED_ROW_HEIGHT = 280;
const OVERSCAN = 10;

function PureMessages({
  addToolApprovalResponse,
  bottomClearance = 0,
  chatError,
  chatId,
  status,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  isArtifactVisible,
  isLoading,
  selectedModelId,
  onEditMessage,
  onForkMessage,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
    reset,
  } = useMessages({
    status,
  });

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      reset();
    }
  }, [chatId, reset]);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom("smooth");
  }, [scrollToBottom]);

  const shouldVirtualize = messages.length > VIRTUALIZATION_THRESHOLD;
  const fallbackVirtualize = !shouldVirtualize && messages.length > 30;

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);

  useEffect(() => {
    if (!shouldVirtualize) {
      return;
    }
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) {
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setScrollTop(container.scrollTop);
      });
    };
    const handleResize = () => {
      setViewportHeight(container.clientHeight);
    };
    handleResize();
    setScrollTop(container.scrollTop);
    container.addEventListener("scroll", handleScroll, { passive: true });
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [shouldVirtualize, messagesContainerRef]);

  const { startIndex, endIndex } = useMemo(() => {
    if (!shouldVirtualize) {
      return { endIndex: messages.length, startIndex: 0 };
    }
    const start = Math.max(
      0,
      Math.floor(scrollTop / ESTIMATED_ROW_HEIGHT) - OVERSCAN
    );
    const end = Math.min(
      messages.length,
      Math.ceil((scrollTop + viewportHeight) / ESTIMATED_ROW_HEIGHT) + OVERSCAN
    );
    // Always include last messages when at bottom or streaming
    if (isAtBottom && end < messages.length) {
      const windowSize = end - start;
      return {
        endIndex: messages.length,
        startIndex: Math.max(0, messages.length - windowSize),
      };
    }
    return { endIndex: end, startIndex: start };
  }, [
    shouldVirtualize,
    scrollTop,
    viewportHeight,
    messages.length,
    isAtBottom,
  ]);

  const visibleMessages = useMemo(
    () => (shouldVirtualize ? messages.slice(startIndex, endIndex) : messages),
    [shouldVirtualize, messages, startIndex, endIndex]
  );

  const topSpacerHeight = shouldVirtualize
    ? startIndex * ESTIMATED_ROW_HEIGHT
    : 0;
  const bottomSpacerHeight = shouldVirtualize
    ? (messages.length - endIndex) * ESTIMATED_ROW_HEIGHT
    : 0;

  return (
    <div className="relative flex-1 bg-transparent">
      <div
        className={cn(
          "absolute inset-0 touch-pan-y overflow-y-auto",
          messages.length > 0 ? "bg-transparent" : "bg-transparent"
        )}
        ref={messagesContainerRef}
        style={isArtifactVisible ? { scrollbarWidth: "none" } : undefined}
      >
        <div
          className="mx-auto flex min-h-full min-w-0 max-w-4xl flex-col gap-6 px-4 pt-4 pb-12 md:gap-7 md:px-6 md:pt-10 md:pb-14"
          style={
            bottomClearance > 0
              ? { paddingBottom: bottomClearance + 24 }
              : undefined
          }
        >
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-1 items-center justify-center px-4 py-10">
              <Greeting />
            </div>
          )}
          {shouldVirtualize && topSpacerHeight > 0 ? (
            <div aria-hidden style={{ height: topSpacerHeight }} />
          ) : null}
          {visibleMessages.map((message, idx) => {
            const actualIndex = shouldVirtualize ? startIndex + idx : idx;
            return (
              <PreviewMessage
                addToolApprovalResponse={addToolApprovalResponse}
                isLoading={
                  status === "streaming" && messages.length - 1 === actualIndex
                }
                isReadonly={isReadonly}
                key={message.id}
                message={message}
                onEdit={onEditMessage}
                onFork={onForkMessage}
                regenerate={regenerate}
                requiresScrollPadding={
                  hasSentMessage && actualIndex === messages.length - 1
                }
                setMessages={setMessages}
                virtualize={fallbackVirtualize}
              />
            );
          })}
          {shouldVirtualize && bottomSpacerHeight > 0 ? (
            <div aria-hidden style={{ height: bottomSpacerHeight }} />
          ) : null}

          {status === "submitted" && messages.at(-1)?.role !== "assistant" && (
            <ThinkingMessage />
          )}

          {status === "error" && chatError && (
            <ChatErrorCard
              chatId={chatId}
              error={chatError}
              modelId={selectedModelId}
              onRetry={regenerate}
            />
          )}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </div>
      </div>

      <motion.button
        animate={{
          opacity: isAtBottom ? 0 : 1,
          scale: isAtBottom ? 0.8 : 1,
          x: "-50%",
          y: isAtBottom ? 8 : 0,
        }}
        aria-label="Scroll to bottom"
        className={`!absolute bottom-4 left-1/2 z-10 flex items-center gap-1.5 rounded-full border border-border bg-surface-container-lowest px-4 shadow-[var(--shadow-float)] h-8 text-[11px] font-medium text-muted-foreground hover:text-foreground ${
          isAtBottom ? "pointer-events-none" : "pointer-events-auto"
        }`}
        initial={false}
        onClick={handleScrollToBottom}
        style={
          bottomClearance > 0
            ? { bottom: bottomClearance + 12, x: "-50%" }
            : { x: "-50%" }
        }
        transition={{ damping: 28, stiffness: 420, type: "spring" }}
        type="button"
      >
        <ArrowDownIcon className="size-3.5 text-muted-foreground" />
        Latest
      </motion.button>
    </div>
  );
}

export const Messages = memo(PureMessages);
