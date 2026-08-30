import "server-only";

type GlobalWithAbort = typeof globalThis & {
  __generationAbortControllers?: Map<string, AbortController>;
};

function getMap(): Map<string, AbortController> {
  const g = globalThis as unknown as GlobalWithAbort;
  if (!g.__generationAbortControllers) {
    g.__generationAbortControllers = new Map<string, AbortController>();
  }
  return g.__generationAbortControllers;
}

export function registerGeneration(
  chatId: string,
  controller: AbortController
): void {
  getMap().set(chatId, controller);
  // auto-cleanup after 70s (maxDuration 60s + buffer) to avoid leaks
  setTimeout(() => {
    const current = getMap().get(chatId);
    if (current === controller) {
      getMap().delete(chatId);
    }
  }, 70_000).unref?.();
}

export function unregisterGeneration(chatId: string): void {
  getMap().delete(chatId);
}

export function abortGeneration(chatId: string): boolean {
  const controller = getMap().get(chatId);
  if (controller && !controller.signal.aborted) {
    controller.abort();
    return true;
  }
  return false;
}

export function getGenerationSignal(chatId: string): AbortSignal | undefined {
  return getMap().get(chatId)?.signal;
}

// Redis-backed cross-instance abort. Cancel endpoint writes a key, streaming
// instance polls it. This avoids needing a long-lived pub/sub subscription
// in serverless environments. Fail-open if Redis unavailable.
let redisClient: ReturnType<typeof import("redis").createClient> | null = null;
let redisReady = false;

async function getRedis() {
  if (!process.env.REDIS_URL) {
    return null;
  }
  if (redisClient?.isOpen) {
    return redisClient;
  }
  if (redisClient && !redisReady) {
    return null;
  }
  try {
    const { createClient } = await import("redis");
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", () => {
      redisReady = false;
    });
    await redisClient.connect();
    redisReady = true;
    return redisClient;
  } catch {
    redisReady = false;
    return null;
  }
}

const ABORT_KEY_PREFIX = "chat:abort:";

export async function publishAbort(chatId: string): Promise<void> {
  // local first
  abortGeneration(chatId);
  const redis = await getRedis();
  if (!redis) {
    return;
  }
  try {
    await redis.set(`${ABORT_KEY_PREFIX}${chatId}`, "1", { EX: 70 });
  } catch {
    // fail-open
  }
}

export async function isAbortedViaRedis(chatId: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) {
    return false;
  }
  try {
    const val = await redis.get(`${ABORT_KEY_PREFIX}${chatId}`);
    return val !== null;
  } catch {
    return false;
  }
}

export async function clearAbortKey(chatId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    return;
  }
  try {
    await redis.del(`${ABORT_KEY_PREFIX}${chatId}`);
  } catch {
    // ignore
  }
}
