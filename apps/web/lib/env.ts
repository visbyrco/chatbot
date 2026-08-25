import { z } from "zod";

const envSchema = z.object({
  ENCRYPTION_KEY: z
    .string()
    .min(1, "ENCRYPTION_KEY is required")
    .refine(
      (val) => Buffer.byteLength(val, "utf8") >= 32,
      "ENCRYPTION_KEY must be at least 32 bytes — generate with: openssl rand -base64 32"
    ),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  POSTGRES_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  UPLOAD_DIR: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

function isDemoActive(): boolean {
  return process.env["DEMO_MODE"] === "1";
}

function isBuildPhase(): boolean {
  return process.env["NEXT_PHASE"] === "phase-production-build";
}

function isClerkConfigured(): boolean {
  // Bracket notation prevents Next.js build-time inlining of NEXT_PUBLIC_* so
  // runtime env from `docker run -e` is honored.
  return (
    Boolean(process.env["CLERK_SECRET_KEY"]) &&
    Boolean(process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"])
  );
}

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // In production, fail fast for weak/missing ENCRYPTION_KEY; otherwise warn
    const isProd = process.env.NODE_ENV === "production";
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    // Never throw during next build — env is not available at build time in Docker/Vercel.
    // Demo mode also runs with no ENCRYPTION_KEY/DB.
    if (isBuildPhase()) {
      console.warn(`[env] Build-time validation warning: ${issues}`);
      return {
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "",
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        POSTGRES_URL: process.env.POSTGRES_URL,
        REDIS_URL: process.env.REDIS_URL,
        UPLOAD_DIR: process.env.UPLOAD_DIR,
      };
    }
    // Demo mode (and PLAYWRIGHT in non-prod) runs with no ENCRYPTION_KEY/DB.
    // Don't fail fast when DEMO_MODE is active — let assertProductionSecurity handle prod demo gating.
    // Also don't fail when Clerk isn't configured or when DB/env is missing in
    // Vercel preview — the app falls back to demo/in-memory handling instead
    // of crashing instrumentation with 500. Preview deployments on PRs often
    // have NEXT_PUBLIC_APP_URL/Clerk set but no ENCRYPTION_KEY/POSTGRES_URL.
    const isVercelPreview = process.env["VERCEL_ENV"] === "preview";
    if (
      isProd &&
      !isDemoActive() &&
      isClerkConfigured() &&
      !isVercelPreview &&
      process.env["POSTGRES_URL"]
    ) {
      throw new Error(`[env] Invalid environment: ${issues}`);
    }
    // In dev/test, or demo in prod, allow missing ENCRYPTION_KEY / POSTGRES_URL
    console.warn(`[env] Environment validation warning: ${issues}`);
    return {
      ENCRYPTION_KEY: process.env["ENCRYPTION_KEY"] ?? "",
      NEXT_PUBLIC_APP_URL: process.env["NEXT_PUBLIC_APP_URL"],
      POSTGRES_URL: process.env["POSTGRES_URL"],
      REDIS_URL: process.env["REDIS_URL"],
      UPLOAD_DIR: process.env["UPLOAD_DIR"],
    };
  }

  const env = parsed.data;

  if (
    !isBuildPhase() &&
    process.env["NODE_ENV"] === "production" &&
    !isDemoActive() &&
    env.NEXT_PUBLIC_APP_URL &&
    !env.NEXT_PUBLIC_APP_URL.startsWith("https://")
  ) {
    try {
      const u = new URL(env.NEXT_PUBLIC_APP_URL);
      const host = u.hostname.toLowerCase();
      const isLocal =
        host === "localhost" || host === "127.0.0.1" || host === "::1";
      if (isLocal) {
        // Allow http for localhost in production (Docker self-hosted)
      } else {
        throw new Error(
          "[env] NEXT_PUBLIC_APP_URL must use https:// in production"
        );
      }
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.includes("NEXT_PUBLIC_APP_URL must use https")
      ) {
        throw e;
      }
      throw new Error(
        "[env] NEXT_PUBLIC_APP_URL must use https:// in production",
        { cause: e }
      );
    }
  }

  return env;
}

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = parseEnv();
  }
  return cachedEnv;
}

// Eager validation in production to fail fast on startup (import side-effect)
// Never run during next build, and skip when DEMO_MODE is active, when Clerk
// is not configured, or in Vercel preview without POSTGRES_URL — all fall
// back to demo/in-memory.
if (
  !isBuildPhase() &&
  process.env["NODE_ENV"] === "production" &&
  !isDemoActive() &&
  isClerkConfigured() &&
  process.env["VERCEL_ENV"] !== "preview" &&
  process.env["POSTGRES_URL"]
) {
  getEnv();
}

export const env = new Proxy({} as Env, {
  get(_target, prop) {
    const e = getEnv();
    return (e as unknown as Record<string, unknown>)[prop as string];
  },
});
