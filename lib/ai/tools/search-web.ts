import { tool } from "ai";
import { z } from "zod";
import { assertPublicUrl } from "@/lib/security/ssrf";
import type { SearchProvider } from "./metadata";

const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";
const TAVILY_TIMEOUT_MS = 10_000;
const SEARXNG_TIMEOUT_MS = 45_000;

type SearchResult = {
  content: string;
  title: string;
  url: string;
};

async function searchTavily({
  apiKey,
  maxResults,
  query,
}: {
  apiKey: string;
  maxResults?: number;
  query: string;
}) {
  const response = await fetch(TAVILY_SEARCH_ENDPOINT, {
    body: JSON.stringify({
      api_key: apiKey,
      include_answer: true,
      max_results: maxResults ?? 5,
      query,
      search_depth: "basic",
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
  });

  if (!response.ok) {
    return {
      error: `Web search failed (HTTP ${response.status}). Please try again later.`,
    };
  }

  const data = await response.json();

  return {
    answer: data.answer,
    query: data.query,
    results: (data.results ?? []).map(
      (result: {
        content: string;
        title: string;
        url: string;
      }): SearchResult => ({
        content: result.content,
        title: result.title,
        url: result.url,
      })
    ),
  };
}

async function searchSearxng({
  apiKey,
  baseURL,
  maxResults,
  query,
}: {
  apiKey?: string;
  baseURL: string;
  maxResults?: number;
  query: string;
}) {
  const url = new URL(`${baseURL.replace(/\/+$/, "")}/search`);
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);

  // User-configured SearXNG base URL is intentional (often self-hosted on
  // localhost / private network). The host is fixed by the user; the query
  // is URL-encoded so it cannot pivot to an arbitrary private host. Allow
  // private addresses here while fetchUrl (fully LLM-controlled) stays blocked.
  await assertPublicUrl(url.href, { allowPrivate: true });

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "chatbot/1.0",
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
    },
    method: "GET",
    signal: AbortSignal.timeout(SEARXNG_TIMEOUT_MS),
  });

  if (!response.ok) {
    return {
      error: `Web search failed (HTTP ${response.status}). Please try again later.`,
    };
  }

  const data = await response.json();

  return {
    answer: undefined,
    query: data.query ?? query,
    results: (data.results ?? []).slice(0, maxResults ?? 5).map(
      (result: {
        content?: string;
        title?: string;
        url?: string;
      }): SearchResult => ({
        content: typeof result.content === "string" ? result.content : "",
        title: typeof result.title === "string" ? result.title : "",
        url: typeof result.url === "string" ? result.url : "",
      })
    ),
  };
}

export function searchWeb({
  apiKey,
  baseURL,
  provider = "tavily",
}: {
  apiKey?: string;
  baseURL?: string;
  provider?: SearchProvider;
}) {
  if (provider === "tavily" && !apiKey) {
    throw new Error("Web search provider 'tavily' requires an API key");
  }
  if (provider === "searxng" && !baseURL) {
    throw new Error("Web search provider 'searxng' requires a base URL");
  }

  return tool({
    description:
      "Search the web for current, up-to-date information. Use this when you need facts, news, or details that may be newer than your training data.",
    execute: async ({ maxResults, query }) => {
      try {
        if (provider === "searxng") {
          return await searchSearxng({
            apiKey,
            baseURL: baseURL ?? "",
            maxResults,
            query,
          });
        }
        return await searchTavily({
          apiKey: apiKey ?? "",
          maxResults,
          query,
        });
      } catch {
        return {
          error: "Web search failed. Please try again.",
        };
      }
    },
    inputSchema: z.object({
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Number of search results to return (1-10, default 5)"),
      query: z.string().describe("The search query."),
    }),
  });
}
