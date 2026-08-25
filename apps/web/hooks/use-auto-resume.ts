"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useEffect } from "react";
import { useDataStream } from "@/components/chat/data-stream-provider";
import type { ChatMessage } from "@/lib/types";

export type UseAutoResumeParams = {
  autoResume: boolean;
  initialMessages: ChatMessage[];
  resumeStream: UseChatHelpers<ChatMessage>["resumeStream"];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  status?: UseChatHelpers<ChatMessage>["status"];
};

export function useAutoResume({
  autoResume,
  initialMessages,
  resumeStream,
  setMessages,
  status,
}: UseAutoResumeParams) {
  const { dataStream } = useDataStream();

  useEffect(() => {
    if (!autoResume) {
      return;
    }

    const mostRecentMessage = initialMessages.at(-1);

    if (
      mostRecentMessage?.role === "user" &&
      (!status ||
        status === "ready" ||
        status === "error" ||
        status === "submitted")
    ) {
      resumeStream();
    }
  }, [autoResume, initialMessages, resumeStream, status]);

  // Resume when tab becomes visible again (background throttling) or reconnects
  useEffect(() => {
    if (!autoResume) {
      return;
    }

    const tryResume = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (status === "streaming" || status === "submitted") {
        return;
      }
      const mostRecent = initialMessages.at(-1);
      if (mostRecent?.role === "user") {
        resumeStream();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tryResume();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tryResume);
    window.addEventListener("online", tryResume);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tryResume);
      window.removeEventListener("online", tryResume);
    };
  }, [autoResume, initialMessages, resumeStream, status]);

  useEffect(() => {
    if (!dataStream) {
      return;
    }
    if (dataStream.length === 0) {
      return;
    }

    const [dataPart] = dataStream;

    if (dataPart.type === "data-appendMessage") {
      let message: ChatMessage;
      try {
        message = JSON.parse(dataPart.data) as ChatMessage;
      } catch {
        console.error("[use-auto-resume] malformed data-appendMessage chunk");
        return;
      }
      setMessages([...initialMessages, message]);
    }
  }, [dataStream, initialMessages, setMessages]);
}
