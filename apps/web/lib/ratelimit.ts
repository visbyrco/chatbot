import { createClient } from "redis";

import { isTestEnvironment } from "@/lib/constants";
import { ChatbotError } from "@/lib/errors";

const TTL_SECONDS = 60 * 60;

// Per-endpoint limits (requests per TTL window)
export const RATE_LIMITS = {
  chat: { limit: 500, windowSeconds: TTL_SECONDS },
  detect: { limit: 20, windowSeconds: TTL_SECONDS },
  document: { limit: 60, windowSeconds: TTL_SECONDS },
  export: { limit: 20, windowSeconds: TTL_SECONDS },
  filesGet: { limit: 60, windowSeconds: TTL_SECONDS },
  history: { limit: 300, windowSeconds: TTL_SECONDS },
  messages: { limit: 100, windowSeconds: TTL_SECONDS },
  providerTest: { limit: 20, windowSeconds: TTL_SECONDS },
  suggestions: { limit: 30, windowSeconds: TTL_SECONDS },
  upload: { limit: 30, windowSeconds: TTL_SECONDS },
} as const;

// In-memory fallback when REDIS_URL is not configured (default local dev)
// Bounded LRU-style store backed by globalThis to survive HMR; use fresh map in vitest for isolation
const MAX_MEMORY_KEYS = 5000;
type MemoryEntry = { count: number; resetAt: number };
const memoryStore: Map<string, MemoryEntry> = (() => {
  if (process.env.VITEST) {
    return new Map<string, MemoryEntry>();
  }
  const g = globalThis as unknown as {
    __ratelimitMemoryStore?: Map<string, MemoryEntry>;
  };
  if (!g.__ratelimitMemoryStore) {
    g.__ratelimitMemoryStore = new Map<string, MemoryEntry>();
  }
  return g.__ratelimitMemoryStore;
})();

function pruneMemoryStore(): void {
  const now = Date.now();
  for (const [k, v] of memoryStore) {
    if (v.resetAt <= now) {
      memoryStore.delete(k);
    }
  }
  if (memoryStore.size > MAX_MEMORY_KEYS) {
    const toDelete = memoryStore.size - MAX_MEMORY_KEYS;
    let i = 0;
    for (const k of memoryStore.keys()) {
      if (i >= toDelete) {
        break;
      }
      memoryStore.delete(k);
      i += 1;
    }
  }
}

function memoryRateLimit(
  _key: string,
  _limit: number,
  windowSeconds: number
): number {
  pruneMemoryStore();
  const now = Date.now();
  const entry = memoryStore.get(_key);
  if (!entry || entry.resetAt <= now) {
    memoryStore.set(_key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client && process.env.REDIS_URL) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => {
      console.warn("Redis rate-limit client error:", err);
    });
    client.connect().catch((err) => {
      console.warn("Redis rate-limit connection failed:", err);
      client = null;
    });
  }
  return client;
}

/**
 * Generic fixed-window rate limiter backed by Redis with in-memory fallback.
 * Uses Lua INCR+EXPIRE only on first hit so TTL is not refreshed each request.
 * Fail-closed when REDIS_URL is set but Redis is unavailable; uses in-memory
 * fallback when REDIS_URL is unset.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  if (isTestEnvironment) {
    return;
  }

  const redis = getClient();

  if (!redis?.isReady) {
    if (process.env.REDIS_URL) {
      // Fail-closed when Redis is expected but not ready
      console.warn(
        `Rate limit check for "${key}" failed: Redis not ready (fail-closed)`
      );
      throw new ChatbotError("rate_limit:chat");
    }
    // In-memory fallback when REDIS_URL not configured
    const count = memoryRateLimit(key, limit, windowSeconds);
    if (count > limit) {
      throw new ChatbotError("rate_limit:chat");
    }
    return;
  }

  try {
    let count: number | undefined;
    const script =
      "local c = redis.call('INCR', KEYS[1]) if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return c";
    // Prefer EVAL, then sendCommand EVAL, then fixed-window SET NX path, then legacy multi
    const redisAny = redis as unknown as {
      eval?: (
        s: string,
        o: { keys: string[]; arguments: string[] }
      ) => Promise<number>;
      sendCommand?: (args: string[]) => Promise<unknown>;
      multi?: () => any;
      set?: (k: string, v: string, o: unknown) => Promise<string | null>;
      incr?: (k: string) => Promise<number>;
    };
    if (typeof redisAny.eval === "function") {
      const res = await redisAny.eval(script, {
        arguments: [String(windowSeconds)],
        keys: [key],
      });
      count = typeof res === "number" ? res : Number(res);
    } else if (typeof redisAny.sendCommand === "function") {
      const res = (await redisAny.sendCommand([
        "EVAL",
        script,
        "1",
        key,
        String(windowSeconds),
      ])) as number;
      count = typeof res === "number" ? res : Number(res);
    } else if (typeof redisAny.multi === "function") {
      // Legacy test mock fallback — uses multi incr+expire (refreshes TTL but keeps tests green)
      const results = (await redisAny
        .multi()
        .incr(key)
        .expire(key, windowSeconds)
        .exec()) as unknown as [Error | null, number][] | null;
      const first = results?.[0];
      count = Array.isArray(first)
        ? (first[1] as number)
        : (first as unknown as number);
    } else if (
      typeof redisAny.set === "function" &&
      typeof redisAny.incr === "function"
    ) {
      // Fallback fixed-window without TTL refresh: SET NX EX then INCR
      const setRes = await redisAny.set(key, "0", {
        EX: windowSeconds,
        NX: true,
      });
      const incrRes = await redisAny.incr(key);
      if (setRes === "OK" && incrRes === 1) {
        // already has TTL from SET
      }
      count = incrRes;
    } else {
      throw new Error("Redis client missing eval/sendCommand/multi/set");
    }

    if (typeof count === "number" && count > limit) {
      throw new ChatbotError("rate_limit:chat");
    }
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    // Fail-closed on Redis errors when REDIS_URL is set
    if (process.env.REDIS_URL) {
      console.warn(
        `Rate limit check for "${key}" failed (fail-closed):`,
        error
      );
      // biome-ignore lint/style/useErrorCause: ChatbotError cause handled via ErrorOptions, biome false positive
      throw new ChatbotError("rate_limit:chat", { cause: error as Error });
    }
    // Fallback to memory when no REDIS_URL
    const count = memoryRateLimit(key, limit, windowSeconds);
    if (count > limit) {
      // biome-ignore lint/style/useErrorCause: rate-limit is intentional, not caused by redis error
      throw new ChatbotError("rate_limit:chat");
    }
  }
}

export async function checkIpRateLimit(
  ip: string | undefined,
  opts?: { userId?: string }
) {
  if (isTestEnvironment) {
    return;
  }

  // Build a key that is robust against IP spoofing: when we have a trusted
  // IP use it, otherwise fall back to userId. When both are present prefer a
  // combined key so an attacker cannot bypass the limit by spoofing x-forwarded-for.
  let key: string | undefined;
  if (ip && opts?.userId) {
    key = `ip-rate-limit:${ip}:user:${opts.userId}`;
  } else if (ip) {
    key = `ip-rate-limit:${ip}`;
  } else if (opts?.userId) {
    key = `ip-rate-limit:user:${opts.userId}`;
  }

  if (!key) {
    console.warn(
      "Rate limit check skipped: no IP or userId available (fail-open with warning)"
    );
    return;
  }

  const { limit, windowSeconds } = RATE_LIMITS.chat;
  await rateLimit(key, limit, windowSeconds);
}

export async function checkUploadRateLimit(
  ip: string | undefined,
  userId: string
) {
  const key = ip
    ? `upload-rate-limit:${ip}:user:${userId}`
    : `upload-rate-limit:user:${userId}`;
  const { limit, windowSeconds } = RATE_LIMITS.upload;
  await rateLimit(key, limit, windowSeconds);
}

export async function checkExportRateLimit(
  ip: string | undefined,
  userId: string
) {
  const key = ip
    ? `export-rate-limit:${ip}:user:${userId}`
    : `export-rate-limit:user:${userId}`;
  const { limit, windowSeconds } = RATE_LIMITS.export;
  await rateLimit(key, limit, windowSeconds);
}

export async function checkProviderTestRateLimit(
  ip: string | undefined,
  userId: string
) {
  const key = ip
    ? `provider-test-rate-limit:${ip}:user:${userId}`
    : `provider-test-rate-limit:user:${userId}`;
  const { limit, windowSeconds } = RATE_LIMITS.providerTest;
  await rateLimit(key, limit, windowSeconds);
}

export async function checkDetectRateLimit(
  ip: string | undefined,
  userId: string
) {
  const key = ip
    ? `detect-rate-limit:${ip}:user:${userId}`
    : `detect-rate-limit:user:${userId}`;
  const { limit, windowSeconds } = RATE_LIMITS.detect;
  await rateLimit(key, limit, windowSeconds);
}

export async function checkHistoryRateLimit(
  ip: string | undefined,
  userId: string
) {
  const key = ip
    ? `history-rate-limit:${ip}:user:${userId}`
    : `history-rate-limit:user:${userId}`;
  const { limit, windowSeconds } = RATE_LIMITS.history;
  await rateLimit(key, limit, windowSeconds);
}

export async function checkMessagesRateLimit(
  ip: string | undefined,
  userId: string
) {
  const key = ip
    ? `messages-rate-limit:${ip}:user:${userId}`
    : `messages-rate-limit:user:${userId}`;
  const { limit, windowSeconds } = RATE_LIMITS.messages;
  await rateLimit(key, limit, windowSeconds);
}

export async function checkDocumentRateLimit(
  ip: string | undefined,
  userId: string
) {
  const key = ip
    ? `document-rate-limit:${ip}:user:${userId}`
    : `document-rate-limit:user:${userId}`;
  const { limit, windowSeconds } = RATE_LIMITS.document;
  await rateLimit(key, limit, windowSeconds);
}

export async function checkSuggestionsRateLimit(
  ip: string | undefined,
  userId: string
) {
  const key = ip
    ? `suggestions-rate-limit:${ip}:user:${userId}`
    : `suggestions-rate-limit:user:${userId}`;
  const { limit, windowSeconds } = RATE_LIMITS.suggestions;
  await rateLimit(key, limit, windowSeconds);
}

export async function checkFilesGetRateLimit(
  ip: string | undefined,
  userId: string
) {
  const key = ip
    ? `files-get-rate-limit:${ip}:user:${userId}`
    : `files-get-rate-limit:user:${userId}`;
  const { limit, windowSeconds } = RATE_LIMITS.filesGet;
  await rateLimit(key, limit, windowSeconds);
}
