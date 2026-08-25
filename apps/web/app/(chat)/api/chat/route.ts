import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { decrypt } from "@/lib/ai/encryption";
import { getEntitlements } from "@/lib/ai/entitlements";
import { getCustomCapabilitiesForUser } from "@/lib/ai/models";
import { calculateUsageCost, getModelPricing } from "@/lib/ai/pricing";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import {
  getCustomProviderOptionsKey,
  getLanguageModel,
  isOpenAICompatibleProvider,
} from "@/lib/ai/providers";
import { editDocument } from "@/lib/ai/tools/edit-document";
import { fetchUrl } from "@/lib/ai/tools/fetch-url";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  DOCUMENT_TOOL_IDS,
  SEARCH_PROVIDERS,
  type SearchProvider,
  TOOL_IDS,
  TOOL_IDS_SET,
} from "@/lib/ai/tools/metadata";
import { runPythonTool } from "@/lib/ai/tools/run-python";
import { searchWeb } from "@/lib/ai/tools/search-web";
import { writeDocument } from "@/lib/ai/tools/write-document";
import { resolveAttachmentParts } from "@/lib/attachments";
import { isProductionEnvironment, isTestEnvironmentNow } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getCustomModelsByProviderId,
  getCustomProviderById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getToolConfigByUserId,
  getUserSettings,
  pruneStreams,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { getClientIp, getRequestHints } from "@/lib/server/request-utils";
import type { ChatMessage, WaitingStatusData } from "@/lib/types";
import {
  convertToUIMessages,
  generateUUID,
  getTextFromMessage,
} from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

const HEALTH_CHECK_DELAY_MS = 9000;

function getStreamErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;

    if (
      e.statusCode === 401 ||
      String(e.message).toLowerCase().includes("invalid api key")
    ) {
      return "Invalid API key. Please check the provider's API key in settings.";
    }

    if (
      String(e.message).toLowerCase().includes("decrypt") ||
      String(e.cause).toLowerCase().includes("decrypt")
    ) {
      return "API key could not be decrypted. If you changed ENCRYPTION_KEY, update the provider's API key in settings.";
    }

    if (typeof e.message === "string" && e.message.length > 0) {
      return `Provider error: ${e.message}`;
    }
  }

  return "An error occurred while sending the message. Please try again.";
}

function isModelStreamActivity(chunk: { type: string }) {
  return !["start", "start-step", "finish-step", "finish", "raw"].includes(
    chunk.type
  );
}

function hasMessageContent(message: ChatMessage | UIMessage): boolean {
  return (
    getTextFromMessage(message).length > 0 ||
    message.parts.some(
      (part) =>
        part.type === "reasoning" ||
        part.type === "tool-invocation" ||
        part.type === "file"
    )
  );
}

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const cause = error.issues.map((i) => i.message).join(", ");
      console.error("Chat API Zod validation failed:", cause, error.issues);
      return new ChatbotError("bad_request:api", cause).toResponse();
    }
    console.error("Chat API JSON parse failed:", error);
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      messages,
      reasoningEffort,
      selectedChatModel,
      selectedVisibilityType,
      enabledTools,
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const chatModel = selectedChatModel;
    const [providerPrefix] = chatModel.split("/");
    if (!providerPrefix.startsWith("custom-")) {
      console.error("Invalid model prefix:", selectedChatModel);
      return new ChatbotError("bad_request:chat").toResponse();
    }
    const providerId = providerPrefix.slice(7);
    // Validate that providerId is a UUID before querying DB to avoid
    // leaking DB errors as 503/400 mismatches. Skip strict UUID check in
    // test/demo where mock IDs like custom-test are used.
    if (
      !isTestEnvironmentNow() &&
      !z.string().uuid().safeParse(providerId).success
    ) {
      console.error("Invalid provider ID format:", providerId, {
        chatModel: selectedChatModel,
      });
      return new ChatbotError("bad_request:chat").toResponse();
    }
    const modelIdPart = chatModel.split("/").slice(1).join("/");

    const [
      provider,
      providerModels,
      messageCount,
      chat,
      modelCapabilities,
      userSettings,
      modelPricing,
    ] = await Promise.all([
      getCustomProviderById({ id: providerId }),
      getCustomModelsByProviderId({ providerId }),
      getMessageCountByUserId({
        differenceInHours: 1,
        id: session.user.id,
      }),
      getChatById({ id }),
      getCustomCapabilitiesForUser(session.user.id),
      getUserSettings({ userId: session.user.id }),
      getModelPricing(chatModel),
    ]);

    if (!provider || provider.userId !== session.user.id) {
      return new ChatbotError("forbidden:chat").toResponse();
    }
    const selectedModel = providerModels.find(
      (model) => model.modelId === modelIdPart
    );
    if (!selectedModel) {
      console.error("Model not allowed:", selectedChatModel, {
        availableModels: providerModels.map((m) => m.modelId),
        modelIdPart,
        providerId,
      });
      return new ChatbotError("bad_request:chat").toResponse();
    }
    const selectedModelName = selectedModel.name;

    await checkIpRateLimit(getClientIp(request), {
      userId: session.user.id,
    });

    const entitlements = getEntitlements();
    if (
      entitlements.maxMessagesPerHour > 0 &&
      messageCount > entitlements.maxMessagesPerHour
    ) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages && messages.length > 0);

    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      messagesFromDb = await getMessagesByChatId({ id });
    } else if (message?.role === "user") {
      await saveChat({
        id,
        title: "New chat",
        userId: session.user.id,
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({
        chatModelId: chatModel,
        message,
        reasoningEffort,
        userId: session.user.id,
      });
    }

    let uiMessages: ChatMessage[];

    if (isToolApprovalFlow && messages) {
      const dbMessages = convertToUIMessages(messagesFromDb);
      const validToolCallIds = new Set<string>(
        messagesFromDb.flatMap((m) => {
          const parts = Array.isArray(m.parts) ? m.parts : [];
          return parts
            .filter(
              (p): p is Record<string, unknown> =>
                typeof p === "object" && p !== null && "toolCallId" in p
            )
            .map((p) => String((p as { toolCallId: unknown }).toolCallId ?? ""))
            .filter((tid) => tid.length > 0);
        })
      );
      const approvalStates = new Map<string, Record<string, unknown>>();
      for (const m of messages) {
        for (const p of (m.parts ?? []) as Record<string, unknown>[]) {
          const { state, toolCallId: rawToolCallId } = p;
          const toolCallId = String(rawToolCallId ?? "");
          if (
            (state === "approval-responded" || state === "output-denied") &&
            toolCallId.length > 0 &&
            validToolCallIds.has(toolCallId) &&
            !approvalStates.has(toolCallId)
          ) {
            approvalStates.set(toolCallId, p);
          }
        }
      }
      uiMessages = dbMessages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (
            "toolCallId" in part &&
            typeof (part as { toolCallId?: unknown }).toolCallId === "string" &&
            approvalStates.has(String(part.toolCallId))
          ) {
            const approval = approvalStates.get(
              String((part as { toolCallId: string }).toolCallId)
            );
            const allowedState = approval?.state;
            if (
              allowedState === "approval-responded" ||
              allowedState === "output-denied"
            ) {
              return { ...part, state: allowedState };
            }
          }
          return part;
        }),
      })) as ChatMessage[];
    } else {
      uiMessages = [
        ...convertToUIMessages(messagesFromDb),
        message as ChatMessage,
      ];
    }

    const { longitude, latitude, city, country } = getRequestHints(request);

    const requestHints: RequestHints = {
      city,
      country,
      latitude,
      longitude,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            attachments: [],
            chatId: id,
            createdAt: new Date(),
            id: message.id,
            metadata: {},
            parts: message.parts,
            role: "user",
          },
        ],
      });
    }

    const capabilities = modelCapabilities[chatModel];
    const isReasoningModel = capabilities?.reasoning === true;
    const supportsTools = capabilities?.tools === true;

    const enabledToolSet = new Set(
      (enabledTools ?? [...TOOL_IDS]).filter((toolId) =>
        TOOL_IDS_SET.has(toolId)
      )
    );

    const approvalToolNames = new Set<string>();
    if (isToolApprovalFlow && messages) {
      for (const m of messages) {
        for (const p of (m.parts ?? []) as Record<string, unknown>[]) {
          if (
            typeof p.toolName === "string" &&
            TOOL_IDS_SET.has(p.toolName as (typeof TOOL_IDS)[number])
          ) {
            approvalToolNames.add(p.toolName);
          }
        }
      }
    }

    const effectiveToolNames = new Set([
      ...enabledToolSet,
      ...[...approvalToolNames].filter(
        (name) =>
          TOOL_IDS_SET.has(name as (typeof TOOL_IDS)[number]) &&
          enabledToolSet.has(name as (typeof TOOL_IDS)[number])
      ),
    ]);

    let searchWebConfig:
      | { apiKey: string; baseURL?: string; provider: SearchProvider }
      | undefined;
    if (supportsTools && effectiveToolNames.has("searchWeb")) {
      // Providers are checked in SEARCH_PROVIDERS order; the first enabled
      // config wins (Tavily takes precedence when both are enabled).
      const searchConfigs = await Promise.all(
        SEARCH_PROVIDERS.map(async (searchProvider) => ({
          provider: searchProvider,
          toolConfig: await getToolConfigByUserId({
            provider: searchProvider,
            toolId: "searchWeb",
            userId: session.user.id,
          }),
        }))
      );
      const enabledSearchConfig = searchConfigs.find(
        ({ toolConfig }) => toolConfig?.enabled === true
      );
      if (enabledSearchConfig) {
        const { provider: configProvider, toolConfig } = enabledSearchConfig;
        try {
          searchWebConfig = {
            apiKey: toolConfig?.encryptedApiKey
              ? decrypt(
                  toolConfig.encryptedApiKey,
                  toolConfig.iv,
                  toolConfig.salt ?? null
                )
              : "",
            baseURL: toolConfig?.baseURL || undefined,
            provider: configProvider,
          };
        } catch (error) {
          console.warn(
            "Failed to decrypt search tool API key, disabling search for this request:",
            error
          );
          searchWebConfig = undefined;
        }
      }
    }

    const hasDocumentTools = DOCUMENT_TOOL_IDS.some((toolId) =>
      effectiveToolNames.has(toolId)
    );
    const responseStartedAt = new Date();
    const baseMessageMetadata = {
      createdAt: responseStartedAt.toISOString(),
      modelId: chatModel,
      modelName: selectedModelName,
      reasoningEffort: isReasoningModel ? reasoningEffort : undefined,
    };
    const modelMessages = await convertToModelMessages(
      await resolveAttachmentParts(uiMessages, session.user.id)
    );
    const userAiContext = userSettings
      ? {
          aiAbout: userSettings.aiAbout,
          aiIncludeDate: userSettings.aiIncludeDate,
          aiIncludeLocation: userSettings.aiIncludeLocation,
          aiInstructions: userSettings.aiInstructions,
          aiPersonality: userSettings.aiPersonality,
          aiUserName: userSettings.aiUserName,
        }
      : null;

    let lastStreamError: unknown = null;

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        lastStreamError = null;
        let hasModelActivity = false;
        let healthCheckTimer: ReturnType<typeof setTimeout> | undefined;
        let outputTokens = 0;
        let inputTokens = 0;
        let cacheHitInputTokens = 0;
        let cacheMissInputTokens = 0;
        let reasoningTokens = 0;
        let tokensPerSecond: number | undefined;
        let timeToFirstToken: number | undefined;

        const clearHealthCheckTimer = () => {
          if (healthCheckTimer) {
            clearTimeout(healthCheckTimer);
          }
        };

        const writeWaitingStatus = (
          phase: WaitingStatusData["phase"],
          messageText: string
        ) => {
          if (hasModelActivity && phase !== "thinking") {
            return;
          }
          dataStream.write({
            data: {
              message: messageText,
              modelId: chatModel,
              modelName: selectedModelName,
              phase,
            },
            transient: true,
            type: "data-waiting-status",
          });
        };

        writeWaitingStatus("waiting", "Waiting...");

        healthCheckTimer = setTimeout(() => {
          writeWaitingStatus("still-waiting", "Still waiting...");
        }, HEALTH_CHECK_DELAY_MS);

        const markModelActive = () => {
          if (hasModelActivity) {
            return;
          }
          hasModelActivity = true;
          clearHealthCheckTimer();
          writeWaitingStatus("thinking", "Thinking...");
        };

        const stopWaitingStatus = () => {
          hasModelActivity = true;
          clearHealthCheckTimer();
        };

        const providerOptionsKey = getCustomProviderOptionsKey(provider);
        const isOpenAICompatible = isOpenAICompatibleProvider(provider);

        // The unified `reasoning` option supports a fixed set of values.
        // Provider-specific values like "max" must be sent through
        // `providerOptions` instead.
        const reasoningValue =
          isReasoningModel &&
          reasoningEffort &&
          reasoningEffort !== "default" &&
          reasoningEffort !== "max"
            ? reasoningEffort
            : undefined;

        const providerOptions =
          isReasoningModel &&
          reasoningEffort &&
          reasoningEffort !== "default" &&
          isOpenAICompatible
            ? {
                [providerOptionsKey]: {
                  reasoningEffort,
                },
              }
            : undefined;

        const result = streamText({
          // intentionally omitted abortSignal to keep generation alive after tab close; client Stop still stops rendering
          activeTools: supportsTools
            ? TOOL_IDS.filter(
                (toolId) =>
                  effectiveToolNames.has(toolId) &&
                  (toolId !== "searchWeb" || searchWebConfig !== undefined)
              )
            : [],
          instructions: systemPrompt({
            requestHints,
            supportsTools: supportsTools && hasDocumentTools,
            userAiContext,
          }),
          messages: modelMessages,
          model: await getLanguageModel(chatModel),
          onAbort() {
            stopWaitingStatus();
          },
          onChunk({ chunk }) {
            if (isModelStreamActivity(chunk)) {
              markModelActive();
            }
          },
          onEnd() {
            stopWaitingStatus();
          },
          onError({ error }: { error: unknown }) {
            console.error("streamText error:", error);
            lastStreamError = error;
            stopWaitingStatus();
          },
          providerOptions,
          reasoning: reasoningValue,
          stopWhen: isStepCount(5),
          telemetry: {
            functionId: "stream-text",
            isEnabled: isProductionEnvironment,
          },
          tools: {
            ...(effectiveToolNames.has("getWeather") ? { getWeather } : {}),
            ...(effectiveToolNames.has("fetchUrl") ? { fetchUrl } : {}),
            ...(effectiveToolNames.has("writeDocument")
              ? {
                  writeDocument: writeDocument({ dataStream, session }),
                }
              : {}),
            ...(effectiveToolNames.has("editDocument")
              ? { editDocument: editDocument({ dataStream, session }) }
              : {}),
            ...(searchWebConfig === undefined
              ? {}
              : {
                  searchWeb: searchWeb({
                    apiKey: searchWebConfig.apiKey,
                    baseURL: searchWebConfig.baseURL,
                    provider: searchWebConfig.provider,
                  }),
                }),
            ...(effectiveToolNames.has("runPython")
              ? { runPython: runPythonTool }
              : {}),
          },
        });

        dataStream.merge(
          toUIMessageStream({
            messageMetadata: ({ part }) => {
              if (part.type === "start") {
                return baseMessageMetadata;
              }
              if (part.type === "finish-step") {
                outputTokens += part.usage.outputTokens ?? 0;
                inputTokens += part.usage.inputTokens ?? 0;
                cacheHitInputTokens +=
                  part.usage.inputTokenDetails?.cacheReadTokens ?? 0;
                cacheMissInputTokens +=
                  part.usage.inputTokenDetails?.noCacheTokens ?? 0;
                reasoningTokens +=
                  part.usage.outputTokenDetails?.reasoningTokens ?? 0;
                tokensPerSecond =
                  part.performance.outputTokensPerSecond ??
                  part.performance.effectiveOutputTokensPerSecond;
                timeToFirstToken ??= part.performance.timeToFirstOutputMs;

                const metadata = {
                  ...baseMessageMetadata,
                  cacheHitInputTokens,
                  cacheMissInputTokens,
                  inputTokens,
                  outputTokens,
                  reasoningTokens,
                  timeToFirstToken,
                  tokensPerSecond,
                };
                const cost = calculateUsageCost(metadata, modelPricing);
                return cost === null ? metadata : { ...metadata, cost };
              }
              if (part.type === "finish") {
                const metadata = {
                  ...baseMessageMetadata,
                  cacheHitInputTokens:
                    part.totalUsage.inputTokenDetails?.cacheReadTokens ??
                    cacheHitInputTokens,
                  cacheMissInputTokens:
                    part.totalUsage.inputTokenDetails?.noCacheTokens ??
                    cacheMissInputTokens,
                  inputTokens: part.totalUsage.inputTokens ?? inputTokens,
                  outputTokens: part.totalUsage.outputTokens ?? outputTokens,
                  reasoningTokens:
                    part.totalUsage.outputTokenDetails?.reasoningTokens ??
                    reasoningTokens,
                  timeToFirstToken,
                  tokensPerSecond,
                };
                const cost = calculateUsageCost(metadata, modelPricing);
                return cost === null ? metadata : { ...metadata, cost };
              }
            },
            sendReasoning: isReasoningModel,
            stream: result.stream,
          })
        );

        if (titlePromise) {
          const p = titlePromise
            .then(async (title) => {
              if (!title || title === "New chat") {
                return;
              }
              dataStream.write({ data: title, type: "data-chat-title" });
              try {
                await updateChatTitleById({ chatId: id, title });
              } catch (error) {
                console.error("[title] update", error);
              }
            })
            .catch((error) => {
              console.error("[title] gen", error);
            });
          try {
            after(() => p);
          } catch {
            // biome-ignore lint/suspicious/noUnusedExpressions: intentional noop
            0;
          }
        }
      },
      generateId: generateUUID,
      onEnd: async ({
        isAborted,
        messages: finishedMessages,
        responseMessage,
      }) => {
        const persist = async () => {
          if (isAborted) {
            const abortedMessage = responseMessage ?? finishedMessages.at(-1);
            if (
              !abortedMessage ||
              !hasMessageContent(abortedMessage as ChatMessage)
            ) {
              return;
            }
            // Save partial abort as single message; reuse same path as normal save
            if (isToolApprovalFlow) {
              const existingMsg = uiMessages.find(
                (m) => m.id === abortedMessage.id
              );
              if (existingMsg) {
                await updateMessage({
                  id: abortedMessage.id,
                  metadata: (abortedMessage as ChatMessage).metadata ?? {},
                  parts: (abortedMessage as ChatMessage).parts,
                });
                return;
              }
            }
            await saveMessages({
              messages: [
                {
                  attachments: [],
                  chatId: id,
                  createdAt: new Date(),
                  id: abortedMessage.id,
                  metadata: (abortedMessage as ChatMessage).metadata ?? {},
                  parts: (abortedMessage as ChatMessage).parts,
                  role: (abortedMessage as ChatMessage).role,
                },
              ],
            });
            return;
          }
          if (isToolApprovalFlow) {
            await Promise.all(
              finishedMessages.map(async (finishedMsg) => {
                const existingMsg = uiMessages.find(
                  (m) => m.id === finishedMsg.id
                );
                if (existingMsg) {
                  await updateMessage({
                    id: finishedMsg.id,
                    metadata: finishedMsg.metadata,
                    parts: finishedMsg.parts,
                  });
                  return;
                }

                await saveMessages({
                  messages: [
                    {
                      attachments: [],
                      chatId: id,
                      createdAt: new Date(),
                      id: finishedMsg.id,
                      metadata: finishedMsg.metadata ?? {},
                      parts: finishedMsg.parts,
                      role: finishedMsg.role,
                    },
                  ],
                });
              })
            );
          } else if (finishedMessages.length > 0) {
            await saveMessages({
              messages: finishedMessages.map((currentMessage) => ({
                attachments: [],
                chatId: id,
                createdAt: new Date(),
                id: currentMessage.id,
                metadata: currentMessage.metadata ?? {},
                parts: currentMessage.parts,
                role: currentMessage.role,
              })),
            });
          }
        };
        try {
          after(() =>
            persist().catch((error) =>
              console.error("[onEnd] after persist", error)
            )
          );
        } catch {
          // biome-ignore lint/suspicious/noUnusedExpressions: intentional noop
          0;
        }
        await persist().catch((error) =>
          console.error("[onEnd] persist", error)
        );
      },
      onError: (error: unknown) => {
        console.error("createUIMessageStream error:", error);
        return getStreamErrorMessage(lastStreamError ?? error);
      },
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
    });

    return createUIMessageStreamResponse({
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateUUID();
            await createStreamId({ chatId: id, streamId });
            try {
              after(() =>
                pruneStreams({ chatId: id }).catch(() => {
                  // biome-ignore lint/suspicious/noUnusedExpressions: intentional noop
                  0;
                })
              );
            } catch {
              // biome-ignore lint/suspicious/noUnusedExpressions: intentional noop
              0;
            }
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch {
          /* non-critical */
        }
      },
      stream,
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    console.error("Unhandled error in chat API:", error);
    const cause =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    return new ChatbotError("bad_request:api", cause).toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
