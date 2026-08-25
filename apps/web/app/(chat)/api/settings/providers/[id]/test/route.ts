import { auth } from "@/app/(auth)/auth";
import { getCustomProviderById, getDecryptedApiKey } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { checkProviderTestRateLimit } from "@/lib/ratelimit";
import { assertPublicUrl } from "@/lib/security/ssrf";
import { getClientIp } from "@/lib/server/request-utils";

const FETCH_TIMEOUT_MS = 5000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:provider").toResponse();
  }

  try {
    await checkProviderTestRateLimit(getClientIp(request), session.user.id);
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    throw error;
  }

  const { id } = await params;
  const provider = await getCustomProviderById({ id });

  if (!provider || provider.userId !== session.user.id) {
    return new ChatbotError("not_found:provider").toResponse();
  }

  const apiKey = await getDecryptedApiKey({ providerId: id });
  const normalizedBaseURL = provider.baseURL.replace(/\/$/, "");

  try {
    if (provider.type === "openai") {
      const targetUrl = `${normalizedBaseURL}/models`;
      await assertPublicUrl(targetUrl, { allowPrivate: true });
      const response = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        return Response.json(
          {
            error: `Connection failed: ${response.status} ${response.statusText}`,
            success: false,
          },
          { status: 400 }
        );
      }

      const data = await response.json();
      const modelCount = data.data?.length ?? 0;

      return Response.json({
        message: `Connection successful. Found ${modelCount} model(s).`,
        modelCount,
        success: true,
      });
    }

    if (provider.type === "anthropic") {
      const targetUrl = `${normalizedBaseURL}/messages`;
      await assertPublicUrl(targetUrl, { allowPrivate: true });
      const response = await fetch(targetUrl, {
        body: JSON.stringify({
          max_tokens: 1,
          messages: [{ content: "Hi", role: "user" }],
          model: "claude-3-haiku-20240307",
        }),
        headers: {
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        method: "POST",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return Response.json(
          {
            error: `Connection failed: ${response.status} ${response.statusText}. ${errorText}`,
            success: false,
          },
          { status: 400 }
        );
      }

      return Response.json({
        message: "Connection successful.",
        success: true,
      });
    }

    return new ChatbotError("bad_request:provider").toResponse();
  } catch (error) {
    console.error("Provider connection test failed:", error);
    let message = "Connection failed.";
    if (error instanceof ChatbotError) {
      message = error.cause ? `${error.message} ${error.cause}` : error.message;
    } else if (error instanceof Error) {
      message = `Connection failed: ${error.message}`;
    }
    return Response.json(
      {
        error: message,
        success: false,
      },
      { status: 400 }
    );
  }
}
