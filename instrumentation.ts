// Telemetry disabled for self-hosted deployment
export async function register() {
  const { assertProductionSecurity } = await import("./lib/constants");
  assertProductionSecurity();
  // Skip ENCRYPTION_KEY validation in demo mode — it runs without DB/keys
  if (process.env.DEMO_MODE === "1") {
    return;
  }
  const { getEnv } = await import("./lib/env");
  getEnv();
  // Prime the rate-limit Redis connection so the first request after boot
  // doesn't race the lazy connect (see #213). Best-effort only: never
  // blocks startup or throws.
  try {
    const { warmRateLimitConnection } = await import("./lib/ratelimit");
    warmRateLimitConnection();
  } catch {
    // Warmup must never break boot.
  }
}
