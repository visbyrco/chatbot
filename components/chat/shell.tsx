"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { forkChat } from "@/app/(chat)/actions";
import { useActiveChat } from "@/hooks/use-active-chat";
import {
  initialArtifactData,
  useArtifact,
  useArtifactSelector,
} from "@/hooks/use-artifact";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Artifact } from "./artifact";
import { ConversationInfoDrawer } from "./conversation-info-drawer";
import { DataStreamHandler } from "./data-stream-handler";
import { submitEditedMessage } from "./message-editor";
import { Messages } from "./messages";
import { MobileTopBar } from "./mobile-top-bar";
import { MultimodalInput } from "./multimodal-input";

export function ChatShell() {
  const {
    chatId,
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    addToolApprovalResponse,
    input,
    setInput,
    reasoningEffort,
    setReasoningEffort,
    visibilityType,
    isReadonly,
    isLoading,
    currentModelId,
    setCurrentModelId,
  } = useActiveChat();
  const pathname = usePathname();

  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(
    null
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const { setArtifact } = useArtifact();
  const visualViewport = useVisualViewport();
  const shellStyle = visualViewport
    ? {
        height: `${visualViewport.height}px`,
        transform: visualViewport.offsetTop
          ? `translateY(${visualViewport.offsetTop}px)`
          : undefined,
      }
    : undefined;

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      setArtifact(initialArtifactData);
      setEditingMessage(null);
      setAttachments([]);
    }
  }, [chatId, setArtifact]);

  const handleEditMessage = useCallback(
    (msg: ChatMessage) => {
      const text = msg.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("");
      setInput(text ?? "");
      setEditingMessage(msg);
    },
    [setInput]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
    setInput("");
  }, [setInput]);

  const handleSendEditedMessage = useCallback(async () => {
    if (!editingMessage) {
      return;
    }

    const msg = editingMessage;
    setEditingMessage(null);
    await submitEditedMessage({
      message: msg,
      regenerate,
      setMessages,
      text: input,
    });
    setInput("");
  }, [editingMessage, input, regenerate, setInput, setMessages]);

  const router = useRouter();

  const handleForkMessage = useCallback(
    async (msg: ChatMessage) => {
      try {
        const { chatId: forkedChatId } = await forkChat({
          branchMessageId: msg.id,
          chatId,
        });
        router.push(
          `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${forkedChatId}`
        );
      } catch (error) {
        console.error("Failed to fork conversation:", error);
        toast.error("Failed to fork conversation.");
      }
    },
    [chatId, router]
  );

  return (
    <>
      <div
        className="flex h-dvh w-full flex-row overflow-hidden"
        style={shellStyle}
      >
        <div className="flex min-w-0 flex-1 flex-row overflow-hidden">
          <div
            className={cn(
              "flex min-w-0 flex-col glass-surface-static transition-[width] duration-200 ease-smooth max-md:w-full",
              isArtifactVisible ? "md:w-1/2 max-md:hidden" : "w-full"
            )}
          >
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent md:border-l md:border-border">
              <MobileTopBar />
              <Messages
                addToolApprovalResponse={addToolApprovalResponse}
                chatId={chatId}
                isArtifactVisible={isArtifactVisible}
                isLoading={isLoading}
                isReadonly={isReadonly}
                messages={messages}
                onEditMessage={handleEditMessage}
                onForkMessage={handleForkMessage}
                regenerate={regenerate}
                selectedModelId={currentModelId}
                setMessages={setMessages}
                status={status}
              />

              <div className="sticky bottom-0 z-10 mx-auto flex w-full max-w-4xl gap-2 bg-transparent px-4 pt-2 pb-3 md:px-6 md:pb-4 md:pt-3">
                {!isReadonly && (
                  <MultimodalInput
                    attachments={attachments}
                    chatId={chatId}
                    editingMessage={editingMessage}
                    input={input}
                    isLoading={isLoading}
                    messages={messages}
                    onCancelEdit={handleCancelEdit}
                    onModelChange={setCurrentModelId}
                    reasoningEffort={reasoningEffort}
                    selectedModelId={currentModelId}
                    selectedVisibilityType={visibilityType}
                    sendMessage={
                      editingMessage ? handleSendEditedMessage : sendMessage
                    }
                    setAttachments={setAttachments}
                    setInput={setInput}
                    setMessages={setMessages}
                    setReasoningEffort={setReasoningEffort}
                    status={status}
                    stop={stop}
                  />
                )}
              </div>
            </div>
          </div>

          <Artifact
            addToolApprovalResponse={addToolApprovalResponse}
            attachments={attachments}
            input={input}
            isReadonly={isReadonly}
            messages={messages}
            regenerate={regenerate}
            selectedModelId={currentModelId}
            selectedVisibilityType={visibilityType}
            sendMessage={sendMessage}
            setAttachments={setAttachments}
            setInput={setInput}
            setMessages={setMessages}
            status={status}
            stop={stop}
          />
        </div>

        {pathname?.includes("/chat/") ? (
          <ConversationInfoDrawer
            chatId={chatId}
            messageCount={messages.length}
          />
        ) : null}
      </div>

      <DataStreamHandler />
    </>
  );
}
