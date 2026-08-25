"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import { memo, useCallback } from "react";
import { useAutoCollapse } from "@/hooks/use-auto-collapse";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { MessageContent } from "../ai-elements/message";
import { MessageResponse } from "../ai-elements/message-response";
import { Shimmer } from "../ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolInput } from "../ai-elements/tool";
import { useDataStream } from "./data-stream-provider";
import { DocumentPreview } from "./document-preview";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";
import { Weather } from "./weather";
import { WebFetchResults } from "./web-fetch";
import { WebSearchResults } from "./web-search";

function WaitingText() {
  const { waitingStatus } = useDataStream();
  const waitingText = waitingStatus?.message ?? "Waiting...";

  return (
    <div className="flex min-h-[calc(14px*1.5)] min-w-0 items-center text-[14px] leading-6">
      <Shimmer
        as="span"
        className="font-medium whitespace-normal break-words"
        duration={1}
      >
        {waitingText}
      </Shimmer>
    </div>
  );
}

function ToolApprovalActions({
  addToolApprovalResponse,
  approvalId,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  approvalId: string;
}) {
  const handleDeny = useCallback(() => {
    addToolApprovalResponse({
      approved: false,
      id: approvalId,
      reason: "User denied weather lookup",
    });
  }, [addToolApprovalResponse, approvalId]);

  const handleAllow = useCallback(() => {
    addToolApprovalResponse({
      approved: true,
      id: approvalId,
    });
  }, [addToolApprovalResponse, approvalId]);

  return (
    <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
      <button
        aria-label="Deny tool execution"
        className="rounded-md border border-input bg-foreground/4 px-3 py-1.5 text-muted-foreground text-sm transition-all hover:bg-foreground/6 hover:text-foreground"
        onClick={handleDeny}
        type="button"
      >
        Deny
      </button>
      <button
        aria-label="Allow tool execution"
        className="rounded-md bg-primary px-4 py-1.5 text-primary-foreground text-sm font-semibold transition-all hover:brightness-110 glow-primary"
        onClick={handleAllow}
        type="button"
      >
        Allow
      </button>
    </div>
  );
}

function SearchWebOutput({
  answer,
  autoCollapse,
  query,
  results,
}: {
  answer?: string;
  autoCollapse: boolean;
  query: string;
  results: Array<{ content: string; title: string; url: string }>;
}) {
  const { open, setOpen } = useAutoCollapse(autoCollapse, !autoCollapse);

  return (
    <WebSearchResults
      answer={answer}
      onOpenChange={setOpen}
      open={open}
      query={query}
      results={results}
    />
  );
}

function FetchUrlOutput({
  autoCollapse,
  result,
}: {
  autoCollapse: boolean;
  result: {
    content: string;
    contentType?: string;
    title?: string;
    url: string;
  };
}) {
  const { open, setOpen } = useAutoCollapse(autoCollapse, !autoCollapse);

  return <WebFetchResults onOpenChange={setOpen} open={open} result={result} />;
}

const PurePreviewMessage = ({
  addToolApprovalResponse,
  message,
  isLoading,
  setMessages: _setMessages,
  regenerate: _regenerate,
  isReadonly,
  requiresScrollPadding: _requiresScrollPadding,
  onEdit,
  onFork,
  virtualize,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  message: ChatMessage;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  onEdit?: (message: ChatMessage) => void;
  onFork?: (message: ChatMessage) => void;
  virtualize: boolean;
}) => {
  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const hasAnyContent = message.parts?.some(
    (part) =>
      (part.type === "text" && part.text?.trim().length > 0) ||
      (part.type === "reasoning" &&
        "text" in part &&
        part.text?.trim().length > 0) ||
      part.type.startsWith("tool-")
  );
  const isThinking = isAssistant && isLoading && !hasAnyContent;

  const hasFollowingPart = (index: number) =>
    message.parts?.some(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        ((candidate.type === "text" && candidate.text?.trim().length > 0) ||
          candidate.type.startsWith("tool-"))
    );

  const attachments = attachmentsFromMessage.length > 0 && (
    <div
      className="flex flex-row justify-end gap-2"
      data-testid={"message-attachments"}
    >
      {attachmentsFromMessage.map((attachment) => {
        // File parts are persisted with a `name` field (see the chat request
        // schema and `multimodal-input.tsx`), but the AI SDK's `FileUIPart`
        // type only declares `filename`. Read both at runtime.
        const filePart = attachment as { name?: string; filename?: string };
        return (
          <PreviewAttachment
            attachment={{
              contentType: attachment.mediaType,
              name: filePart.name ?? filePart.filename ?? "file",
              url: attachment.url,
            }}
            key={attachment.url}
          />
        );
      })}
    </div>
  );

  const mergedReasoning = message.parts?.reduce(
    (acc, part) => {
      if (part.type === "reasoning" && part.text?.trim().length > 0) {
        return {
          isStreaming: "state" in part ? part.state === "streaming" : false,
          rendered: false,
          text: acc.text ? `${acc.text}\n\n${part.text}` : part.text,
        };
      }
      return acc;
    },
    { isStreaming: false, rendered: false, text: "" }
  ) ?? { isStreaming: false, rendered: false, text: "" };

  const parts = message.parts?.map((part, index) => {
    const { type } = part;
    const key = `message-${message.id}-part-${index}`;

    if (type === "reasoning") {
      if (!mergedReasoning.rendered && mergedReasoning.text) {
        mergedReasoning.rendered = true;
        return (
          <MessageReasoning
            autoCollapse={hasFollowingPart(index)}
            isLoading={isLoading || mergedReasoning.isStreaming}
            key={key}
            reasoning={mergedReasoning.text}
          />
        );
      }
      return null;
    }

    if (type === "text") {
      return (
        <MessageContent
          className={cn("text-[14px] leading-6", {
            "w-fit max-w-[min(78%,56ch)] overflow-hidden break-words rounded-2xl rounded-br-lg border border-transparent bg-primary px-4 py-2.5 text-primary-foreground shadow-sm":
              message.role === "user",
          })}
          data-testid="message-content"
          key={key}
        >
          <MessageResponse>{sanitizeText(part.text)}</MessageResponse>
        </MessageContent>
      );
    }

    if (type === "tool-getWeather") {
      const { toolCallId, state } = part;
      const approvalId = (part as { approval?: { id: string } }).approval?.id;
      const isDenied =
        state === "output-denied" ||
        (state === "approval-responded" &&
          (part as { approval?: { approved?: boolean } }).approval?.approved ===
            false);
      const widthClass = "w-[min(100%,450px)]";

      if (state === "output-available") {
        return (
          <div className={widthClass} key={toolCallId}>
            <Weather weatherAtLocation={part.output} />
          </div>
        );
      }

      if (isDenied) {
        return (
          <div className={widthClass} key={toolCallId}>
            <Tool
              autoCollapse={hasFollowingPart(index)}
              className="w-full"
              defaultOpen={true}
            >
              <ToolHeader state="output-denied" type="tool-getWeather" />
              <ToolContent>
                <div className="px-4 py-3 text-muted-foreground text-sm">
                  Weather lookup was denied.
                </div>
              </ToolContent>
            </Tool>
          </div>
        );
      }

      if (state === "approval-responded") {
        return (
          <div className={widthClass} key={toolCallId}>
            <Tool
              autoCollapse={hasFollowingPart(index)}
              className="w-full"
              defaultOpen={true}
            >
              <ToolHeader state={state} type="tool-getWeather" />
              <ToolContent>
                <ToolInput input={part.input} />
              </ToolContent>
            </Tool>
          </div>
        );
      }

      return (
        <div className={widthClass} key={toolCallId}>
          <Tool
            autoCollapse={hasFollowingPart(index)}
            className="w-full"
            defaultOpen={true}
          >
            <ToolHeader state={state} type="tool-getWeather" />
            <ToolContent>
              {(state === "input-available" ||
                state === "approval-requested") && (
                <ToolInput input={part.input} />
              )}
              {state === "approval-requested" && approvalId && (
                <ToolApprovalActions
                  addToolApprovalResponse={addToolApprovalResponse}
                  approvalId={approvalId}
                />
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (type === "tool-writeDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-error/20 bg-error/10 p-4 text-error"
            key={toolCallId}
          >
            Error writing document: {String(part.output.error)}
          </div>
        );
      }

      return (
        <div className="relative" key={toolCallId}>
          <DocumentPreview
            args={{
              ...part.output,
              isUpdate: Boolean(part.input && "id" in part.input),
            }}
            isReadonly={isReadonly}
            result={part.output}
          />
        </div>
      );
    }

    if (type === "tool-searchWeb") {
      const { toolCallId, state } = part;
      const approvalId = (part as { approval?: { id: string } }).approval?.id;
      const isDenied =
        state === "output-denied" ||
        (state === "approval-responded" &&
          (part as { approval?: { approved?: boolean } }).approval?.approved ===
            false);
      const widthClass = "w-[min(100%,450px)]";

      if (state === "output-available") {
        return (
          <div className={widthClass} key={toolCallId}>
            {"error" in part.output ? (
              <div className="rounded-lg border border-error/20 bg-error/10 p-4 text-error">
                {String(part.output.error)}
              </div>
            ) : (
              <SearchWebOutput
                answer={part.output.answer}
                autoCollapse={hasFollowingPart(index)}
                query={part.output.query}
                results={part.output.results}
              />
            )}
          </div>
        );
      }

      if (isDenied) {
        return (
          <div className={widthClass} key={toolCallId}>
            <Tool
              autoCollapse={hasFollowingPart(index)}
              className="w-full"
              defaultOpen={true}
            >
              <ToolHeader state="output-denied" type="tool-searchWeb" />
              <ToolContent>
                <div className="px-4 py-3 text-muted-foreground text-sm">
                  Web search was denied.
                </div>
              </ToolContent>
            </Tool>
          </div>
        );
      }

      if (state === "approval-responded") {
        return (
          <div className={widthClass} key={toolCallId}>
            <Tool
              autoCollapse={hasFollowingPart(index)}
              className="w-full"
              defaultOpen={true}
            >
              <ToolHeader state={state} type="tool-searchWeb" />
              <ToolContent>
                <ToolInput input={part.input} />
              </ToolContent>
            </Tool>
          </div>
        );
      }

      return (
        <div className={widthClass} key={toolCallId}>
          <Tool
            autoCollapse={hasFollowingPart(index)}
            className="w-full"
            defaultOpen={true}
          >
            <ToolHeader state={state} type="tool-searchWeb" />
            <ToolContent>
              {(state === "input-available" ||
                state === "approval-requested") && (
                <ToolInput input={part.input} />
              )}
              {state === "approval-requested" && approvalId && (
                <ToolApprovalActions
                  addToolApprovalResponse={addToolApprovalResponse}
                  approvalId={approvalId}
                />
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (type === "tool-fetchUrl") {
      const { toolCallId, state } = part;
      const approvalId = (part as { approval?: { id: string } }).approval?.id;
      const isDenied =
        state === "output-denied" ||
        (state === "approval-responded" &&
          (part as { approval?: { approved?: boolean } }).approval?.approved ===
            false);
      const widthClass = "w-[min(100%,450px)]";

      if (state === "output-available") {
        return (
          <div className={widthClass} key={toolCallId}>
            {"error" in part.output ? (
              <div className="rounded-lg border border-error/20 bg-error/10 p-4 text-error">
                {String(part.output.error)}
              </div>
            ) : (
              <FetchUrlOutput
                autoCollapse={hasFollowingPart(index)}
                result={part.output}
              />
            )}
          </div>
        );
      }

      if (isDenied) {
        return (
          <div className={widthClass} key={toolCallId}>
            <Tool
              autoCollapse={hasFollowingPart(index)}
              className="w-full"
              defaultOpen={true}
            >
              <ToolHeader state="output-denied" type="tool-fetchUrl" />
              <ToolContent>
                <div className="px-4 py-3 text-muted-foreground text-sm">
                  Fetching the URL was denied.
                </div>
              </ToolContent>
            </Tool>
          </div>
        );
      }

      return (
        <div className={widthClass} key={toolCallId}>
          <Tool
            autoCollapse={hasFollowingPart(index)}
            className="w-full"
            defaultOpen={true}
          >
            <ToolHeader state={state} type="tool-fetchUrl" />
            <ToolContent>
              {(state === "input-available" ||
                state === "approval-requested") && (
                <ToolInput input={part.input} />
              )}
              {state === "approval-requested" && approvalId && (
                <ToolApprovalActions
                  addToolApprovalResponse={addToolApprovalResponse}
                  approvalId={approvalId}
                />
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (type === "tool-runPython") {
      const { toolCallId, state } = part;
      const widthClass = "w-[min(100%,450px)]";

      if (state === "output-available") {
        const { output } = part;
        return (
          <div className={widthClass} key={toolCallId}>
            <Tool
              autoCollapse={hasFollowingPart(index)}
              className="w-full"
              defaultOpen={Boolean(output.error)}
            >
              <ToolHeader state={state} type="tool-runPython" />
              <ToolContent>
                <ToolInput input={part.input} />
                {output.stdout ? (
                  <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-foreground/5 px-3 py-2 font-mono text-xs leading-relaxed">
                    {sanitizeText(output.stdout)}
                  </pre>
                ) : null}
                {output.stderr ? (
                  <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-foreground/5 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
                    {sanitizeText(output.stderr)}
                  </pre>
                ) : null}
                {output.result === undefined ? null : (
                  <div className="rounded-lg bg-foreground/5 px-3 py-2 font-mono text-xs leading-relaxed">
                    {String(output.result)}
                  </div>
                )}
                {output.error ? (
                  <div className="rounded-lg bg-destructive/10 px-3 py-2 font-mono text-xs leading-relaxed text-destructive">
                    {sanitizeText(output.error)}
                  </div>
                ) : null}
              </ToolContent>
            </Tool>
          </div>
        );
      }

      return (
        <div className={widthClass} key={toolCallId}>
          <Tool
            autoCollapse={hasFollowingPart(index)}
            className="w-full"
            defaultOpen={true}
          >
            <ToolHeader state={state} type="tool-runPython" />
            <ToolContent>
              {(state === "input-available" ||
                state === "approval-requested") && (
                <ToolInput input={part.input} />
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    return null;
  });

  const actions = !isReadonly && (
    <MessageActions
      isLoading={isLoading}
      key={`action-${message.id}`}
      message={message}
      onEdit={onEdit ? () => onEdit(message) : undefined}
      onFork={onFork ? () => onFork(message) : undefined}
    />
  );

  const content = isThinking ? (
    <WaitingText />
  ) : (
    <>
      {attachments}
      {parts}
      {actions}
    </>
  );

  return (
    <div
      className={cn(
        "group/message w-full",
        !isAssistant &&
          "motion-safe:animate-[fade-up_0.25s_cubic-bezier(0.22,1,0.36,1)]"
      )}
      data-role={message.role}
      data-testid={`message-${message.role}`}
      style={
        virtualize
          ? { containIntrinsicSize: "auto 200px", contentVisibility: "auto" }
          : undefined
      }
    >
      <div
        className={cn(
          isUser ? "flex flex-col items-end gap-2" : "flex items-start gap-3"
        )}
      >
        {isAssistant && (
          <div className="flex h-[calc(14px*1.5)] shrink-0 items-center">
            <div className="flex size-7 items-center justify-center rounded-lg border bg-foreground/5 text-primary ring-1 ring-primary/20">
              <SparklesIcon size={13} />
            </div>
          </div>
        )}
        {isAssistant ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">{content}</div>
        ) : (
          content
        )}
      </div>
    </div>
  );
};

export const PreviewMessage = memo(PurePreviewMessage);

export const ThinkingMessage = () => (
  <div
    className="group/message w-full"
    data-role="assistant"
    data-testid="message-assistant-loading"
  >
    <div className="flex items-start gap-3">
      <div className="flex h-[calc(14px*1.5)] shrink-0 items-center">
        <div className="flex size-7 items-center justify-center rounded-lg border bg-foreground/5 text-primary ring-1 ring-primary/20">
          <SparklesIcon size={13} />
        </div>
      </div>

      <WaitingText />
    </div>
  </div>
);
