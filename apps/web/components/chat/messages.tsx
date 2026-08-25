import type { UseChatHelpers } from "@ai-sdk/react";
import { motion } from "framer-motion";
import { ArrowDownIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMessages } from "@/hooks/use-messages";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";

type MessagesProps = {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
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

// Fixed estimate: lightweight heuristic for 500+ message windowing.
// It drifts for variable-height content (code blocks, images, tool outputs).
// For precise virtualization, replace with dynamic measurement
// (ResizeObserver per row or @tanstack/react-virtual).
const VIRTUALIZATION_THRESHOLD = 100;
const ESTIMATED_ROW_HEIGHT = 280;
const OVERSCAN = 10;

function PureMessages({
  addToolApprovalResponse,
  chatId,
  status,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  isArtifactVisible,
  isLoading,
  selectedModelId: _selectedModelId,
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
      {messages.length === 0 && !isLoading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <Greeting />
        </div>
      )}
      <div
        className={cn(
          "absolute inset-0 touch-pan-y overflow-y-auto",
          messages.length > 0 ? "bg-transparent" : "bg-transparent"
        )}
        ref={messagesContainerRef}
        style={isArtifactVisible ? { scrollbarWidth: "none" } : undefined}
      >
        <div className="mx-auto flex min-h-full min-w-0 max-w-4xl flex-col gap-6 px-4 pt-16 pb-8 md:gap-7 md:px-6 md:py-10">
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
        className={`!absolute bottom-4 left-1/2 z-10 flex items-center rounded-lg border border-border bg-surface-container-lowest px-3.5 shadow-[var(--shadow-float)] h-7 text-[10px] ${
          isAtBottom ? "pointer-events-none" : "pointer-events-auto"
        }`}
        initial={false}
        onClick={handleScrollToBottom}
        style={{ x: "-50%" }}
        transition={{ damping: 28, stiffness: 420, type: "spring" }}
        type="button"
      >
        <ArrowDownIcon className="size-3 text-muted-foreground" />
      </motion.button>
    </div>
  );
}

export const Messages = memo(PureMessages);
