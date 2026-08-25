"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { usePathname } from "next/navigation";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import { useDataStream } from "@/components/chat/data-stream-provider";
import { toast } from "@/components/chat/toast";
import { useAutoResume } from "@/hooks/use-auto-resume";
import type { ChatModel, ReasoningEffort } from "@/lib/ai/models.client";
import type { ToolId } from "@/lib/ai/tools/metadata";
import { TOOL_IDS, TOOL_IDS_SET } from "@/lib/ai/tools/metadata";
import { ChatbotError } from "@/lib/errors";
import { syncPreference } from "@/lib/preferences-sync";
import type { ChatMessage, VisibilityType } from "@/lib/types";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { isValidModelIdFormat, isValidUUID } from "@/lib/validation";

type ActiveChatContextValue = {
  chatId: string;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  status: UseChatHelpers<ChatMessage>["status"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  visibilityType: VisibilityType;
  isReadonly: boolean;
  isLoading: boolean;
  currentModelId: string;
  setCurrentModelId: (id: string) => void;
  enabledTools: ToolId[];
  setEnabledTools: (tools: ToolId[]) => void;
};

const ActiveChatContext = createContext<ActiveChatContextValue | null>(null);

function extractChatId(pathname: string): string | null {
  const match = pathname.match(/\/chat\/([^/]+)/);
  const candidate = match ? match[1] : null;
  if (candidate && isValidUUID(candidate)) {
    return candidate;
  }
  return null;
}

export function ActiveChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { setDataStream, setWaitingStatus } = useDataStream();
  const { mutate } = useSWRConfig();

  const chatIdFromUrl = extractChatId(pathname);
  const isNewChat = !chatIdFromUrl;
  const newChatIdRef = useRef(generateUUID());
  const prevPathnameRef = useRef(pathname);

  if (isNewChat && prevPathnameRef.current !== pathname) {
    newChatIdRef.current = generateUUID();
  }
  prevPathnameRef.current = pathname;

  const chatId = chatIdFromUrl ?? newChatIdRef.current;

  const [currentModelId, setCurrentModelId] = useState("");
  const currentModelIdRef = useRef(currentModelId);
  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  const [reasoningEffort, setReasoningEffortState] =
    useState<ReasoningEffort>("default");
  const reasoningEffortRef = useRef(reasoningEffort);
  useEffect(() => {
    reasoningEffortRef.current = reasoningEffort;
  }, [reasoningEffort]);

  const [enabledTools, setEnabledToolsState] = useState<ToolId[]>([
    ...TOOL_IDS,
  ]);
  const enabledToolsRef = useRef(enabledTools);
  useEffect(() => {
    enabledToolsRef.current = enabledTools;
  }, [enabledTools]);

  useEffect(() => {
    const cookieValue = document.cookie
      .split("; ")
      .find((row) => row.startsWith("chat-tools="))
      ?.split("=")[1];
    if (!cookieValue) {
      return;
    }
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(cookieValue));
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (id): id is ToolId => typeof id === "string" && TOOL_IDS_SET.has(id)
        );
        if (valid.length > 0) {
          const ordered = TOOL_IDS.filter((id) => valid.includes(id));
          setEnabledToolsState(ordered);
        }
      }
    } catch {
      // malformed cookie -> keep default (all tools enabled)
    }
  }, []);

  const [input, setInput] = useState("");

  const { data: modelsData } = useSWR<{
    models: ChatModel[];
    providerNames?: Record<string, string>;
    capabilities?: Record<string, unknown>;
  }>(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`, fetcher, {
    dedupingInterval: 3_600_000,
  });

  const modelsDataRef = useRef<typeof modelsData>(modelsData);
  useEffect(() => {
    modelsDataRef.current = modelsData;
  }, [modelsData]);

  const { data: chatData, isLoading } = useSWR(
    isNewChat
      ? null
      : `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/messages?chatId=${chatId}`,
    fetcher,
    { revalidateOnFocus: true, revalidateOnReconnect: true }
  );

  const initialMessages: ChatMessage[] = isNewChat
    ? []
    : (chatData?.messages ?? []);
  const visibility: VisibilityType = isNewChat
    ? "private"
    : (chatData?.visibility ?? "private");

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    experimental_throttle: 100,
    generateId: generateUUID,
    id: chatId,
    messages: initialMessages,
    onData: (dataPart) => {
      if (dataPart.type === "data-waiting-status") {
        setWaitingStatus(dataPart.data);
        return;
      }
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onError: (error) => {
      if (error instanceof ChatbotError) {
        toast({ description: error.message, type: "error" });
      } else {
        toast({
          description: error.message || "Oops, an error occurred!",
          type: "error",
        });
      }
    },
    onFinish: () => {
      mutate(
        (key) => typeof key === "string" && key.includes("/api/history"),
        undefined,
        { revalidate: true }
      );
      try {
        const ch = new BroadcastChannel("chat-history");
        ch.postMessage({ type: "mutate" });
        ch.close();
        // biome-ignore lint/suspicious/noEmptyBlockStatements: broadcast fallback non-critical
      } catch {}
      // localStorage fallback for Safari / older browsers
      try {
        localStorage.setItem("chat-history-ping", String(Date.now()));
        // biome-ignore lint/suspicious/noEmptyBlockStatements: storage fallback non-critical
      } catch {}
    },
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const lastMessage = currentMessages.at(-1);
      return (
        lastMessage?.parts?.some(
          (part) =>
            "state" in part &&
            part.state === "approval-responded" &&
            "approval" in part &&
            (part.approval as { approved?: boolean })?.approved === true
        ) ?? false
      );
    },
    transport: new DefaultChatTransport({
      api: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat`,
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const lastMessage = request.messages.at(-1);
        const isToolApprovalContinuation =
          lastMessage?.role !== "user" ||
          request.messages.some((msg) =>
            msg.parts?.some((part) => {
              const { state } = part as { state?: string };
              return (
                state === "approval-responded" || state === "output-denied"
              );
            })
          );

        // Resolve effective model: prefer current selection, fallback to first available model
        let effectiveModelId = currentModelIdRef.current;
        const fallbackId =
          (modelsDataRef.current as { models?: { id: string }[] } | undefined)
            ?.models?.[0]?.id ?? "";
        if (
          (!isValidModelIdFormat(effectiveModelId) ||
            (modelsDataRef.current?.models?.length &&
              !modelsDataRef.current.models.some(
                (m: Pick<ChatModel, "id">) => m.id === effectiveModelId
              ))) &&
          fallbackId &&
          isValidModelIdFormat(fallbackId)
        ) {
          effectiveModelId = fallbackId;
          // Keep ref in sync so subsequent sends are stable
          currentModelIdRef.current = fallbackId;
        }

        if (!isValidModelIdFormat(effectiveModelId)) {
          throw new ChatbotError(
            "bad_request:chat",
            "No model selected. Please choose a model before sending."
          );
        }

        return {
          body: {
            id: request.id,
            ...(isToolApprovalContinuation
              ? { messages: request.messages }
              : { message: lastMessage }),
            enabledTools: enabledToolsRef.current,
            reasoningEffort: reasoningEffortRef.current,
            selectedChatModel: effectiveModelId,
            selectedVisibilityType: visibility,
            ...request.body,
          },
        };
      },
    }),
  });

  useEffect(() => {
    if (status === "submitted" || status === "ready" || status === "error") {
      setWaitingStatus(undefined);
    }
  }, [status, setWaitingStatus]);

  const loadedChatIds = useRef(new Set<string>());

  if (isNewChat && !loadedChatIds.current.has(newChatIdRef.current)) {
    loadedChatIds.current.add(newChatIdRef.current);
  }

  useEffect(() => {
    if (loadedChatIds.current.has(chatId)) {
      return;
    }
    if (chatData?.messages) {
      loadedChatIds.current.add(chatId);
      setMessages(chatData.messages);
    }
  }, [chatId, chatData?.messages, setMessages]);

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      if (isNewChat) {
        setMessages([]);
      }
    }
  }, [chatId, isNewChat, setMessages]);

  useEffect(() => {
    const validReasoningEfforts: ReasoningEffort[] = [
      "default",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ];
    const readCookie = (name: string) =>
      document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${name}=`))
        ?.split("=")[1];

    const cookieModel = readCookie("chat-model");
    if (cookieModel) {
      setCurrentModelId(decodeURIComponent(cookieModel));
    }

    const cookieEffort = readCookie("reasoning-effort");
    if (cookieEffort) {
      const decodedEffort = decodeURIComponent(cookieEffort);
      if (validReasoningEfforts.includes(decodedEffort as ReasoningEffort)) {
        setReasoningEffortState(decodedEffort as ReasoningEffort);
      }
    }
  }, []);

  useEffect(() => {
    const firstModelId = modelsData?.models?.[0]?.id;
    if (!firstModelId) {
      return;
    }
    const availableIds = new Set(
      (modelsData?.models ?? []).map((m: { id: string }) => m.id)
    );
    const currentIsValid =
      currentModelId.length > 0 &&
      isValidModelIdFormat(currentModelId) &&
      (availableIds.size === 0 || availableIds.has(currentModelId));
    // If no valid model is selected, or the cookie points to a deleted model,
    // fall back to the first available model
    if (currentIsValid) {
      return;
    }
    setCurrentModelId(firstModelId);
    // biome-ignore lint/suspicious/noDocumentCookie: default model persistence
    document.cookie = `chat-model=${encodeURIComponent(firstModelId)}; path=/`;
  }, [modelsData, currentModelId]);

  const setReasoningEffort = useCallback((effort: ReasoningEffort) => {
    setReasoningEffortState(effort);
    // biome-ignore lint/suspicious/noDocumentCookie: cookie persistence for user preference
    document.cookie = `reasoning-effort=${encodeURIComponent(effort)}; max-age=${60 * 60 * 24 * 365}; path=/`;
    syncPreference("reasoningEffort");
  }, []);

  const setEnabledTools = useCallback((tools: ToolId[]) => {
    setEnabledToolsState(tools);
    // biome-ignore lint/suspicious/noDocumentCookie: cookie persistence for user preference
    document.cookie = `chat-tools=${encodeURIComponent(JSON.stringify(tools))}; max-age=${60 * 60 * 24 * 365}; path=/`;
    syncPreference("enabledTools");
  }, []);

  const hasAppendedQueryRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("query");
    if (query && !hasAppendedQueryRef.current) {
      hasAppendedQueryRef.current = true;
      window.history.replaceState(
        {},
        "",
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
      );
      sendMessage({
        parts: [{ text: query, type: "text" }],
        role: "user" as const,
      });
    }
  }, [sendMessage, chatId]);

  useAutoResume({
    autoResume: !isNewChat && !!chatData,
    initialMessages,
    resumeStream,
    setMessages,
    status,
  });

  const isReadonly = isNewChat ? false : (chatData?.isReadonly ?? false);

  const value = useMemo<ActiveChatContextValue>(
    () => ({
      addToolApprovalResponse,
      chatId,
      currentModelId,
      enabledTools,
      input,
      isLoading: !isNewChat && isLoading,
      isReadonly,
      messages,
      reasoningEffort,
      regenerate,
      sendMessage,
      setCurrentModelId,
      setEnabledTools,
      setInput,
      setMessages,
      setReasoningEffort,
      status,
      stop,
      visibilityType: visibility,
    }),
    [
      chatId,
      messages,
      setMessages,
      sendMessage,
      status,
      stop,
      regenerate,
      addToolApprovalResponse,
      input,
      reasoningEffort,
      setReasoningEffort,
      visibility,
      isReadonly,
      isNewChat,
      isLoading,
      currentModelId,
      enabledTools,
      setEnabledTools,
    ]
  );

  return (
    <ActiveChatContext.Provider value={value}>
      {children}
    </ActiveChatContext.Provider>
  );
}

export function useActiveChat() {
  const context = useContext(ActiveChatContext);
  if (!context) {
    throw new Error("useActiveChat must be used within ActiveChatProvider");
  }
  return context;
}
