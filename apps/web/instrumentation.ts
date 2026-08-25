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
}
