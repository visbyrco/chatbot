export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isDemoMode = process.env.DEMO_MODE === "1";

// Static helpers above are evaluated at import time. Next.js may inline
// NEXT_PUBLIC_* at build time, but server runtime env (DEMO_MODE,
// NODE_ENV) must be re-evaluated per-request/at runtime so a Docker Hub
// image built without DEMO_MODE still honors DEMO_MODE=1 at `docker run`.
export function isProductionEnvironmentNow(): boolean {
  return process.env.NODE_ENV === "production";
}
export function isDemoModeNow(): boolean {
  return process.env.DEMO_MODE === "1";
}
function hasPlaywrightFlagNow(): boolean {
  return Boolean(
    process.env.PLAYWRIGHT_TEST_BASE_URL ||
      process.env.PLAYWRIGHT ||
      process.env.CI_PLAYWRIGHT
  );
}
function allowDemoInProductionNow(): boolean {
  return process.env.ALLOW_DEMO_IN_PROD === "1";
}
function isVercelPreviewNow(): boolean {
  return process.env.VERCEL_ENV === "preview";
}
export function isTestEnvironmentNow(): boolean {
  const demoNow = isDemoModeNow();
  const prodNow = isProductionEnvironmentNow();
  const allowNow = allowDemoInProductionNow();
  const pwNow = hasPlaywrightFlagNow();
  const previewNow = isVercelPreviewNow();
  return (
    (demoNow && (!prodNow || allowNow || previewNow)) || (!prodNow && pwNow)
  );
}
// Use bracket notation to avoid Next.js build-time inlining of NEXT_PUBLIC_*.
// A dotted `process.env.NEXT_PUBLIC_*` read is replaced at build time, which
// breaks Docker Hub images built without keys but run with keys at `docker run`.
// `process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]` survives to runtime.
function getPublishableKeyNow(): string | undefined {
  return process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];
}

export function isClerkConfiguredNow(): boolean {
  return (
    Boolean(process.env["CLERK_SECRET_KEY"]) && Boolean(getPublishableKeyNow())
  );
}
// Single source of truth for "run on mock auth instead of Clerk". Must match
// every consumer (middleware, auth(), ClerkProvider gate, UI branches) so the
// session source and the rendered auth components can never disagree.
export function usesMockAuthNow(): boolean {
  return (
    isTestEnvironmentNow() ||
    !isClerkConfiguredNow() ||
    !process.env["POSTGRES_URL"] ||
    process.env["VERCEL_ENV"] === "preview"
  );
}

const hasPlaywrightFlag = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

const allowDemoInProduction = process.env.ALLOW_DEMO_IN_PROD === "1";

export const isTestEnvironment =
  (isDemoMode && (!isProductionEnvironment || allowDemoInProduction)) ||
  (!isProductionEnvironment && hasPlaywrightFlag);

export function assertProductionSecurity(): void {
  // Re-evaluate at call time so instrumentation and middleware see runtime env,
  // not the build-time inlined snapshot.
  const prodNow = isProductionEnvironmentNow();
  const demoNow = isDemoModeNow();
  const allowNow = allowDemoInProductionNow();
  const pwNow = hasPlaywrightFlagNow();
  const previewNow = isVercelPreviewNow();
  // Vercel preview (VERCEL_ENV=preview) is a production build (NODE_ENV=production)
  // but is not the production deployment — allow DEMO_MODE there without
  // ALLOW_DEMO_IN_PROD so PR previews don't need the prod flag.
  if (prodNow && demoNow && !allowNow && !previewNow) {
    throw new Error(
      "[security] DEMO_MODE=1 is not allowed in production. Refusing to start. " +
        "Unset DEMO_MODE or set ALLOW_DEMO_IN_PROD=1 to explicitly allow demo bypass in production."
    );
  }

  if (prodNow && pwNow) {
    throw new Error(
      "[security] PLAYWRIGHT/CI_PLAYWRIGHT flags are set in production. Refusing to start. " +
        "Unset PLAYWRIGHT, PLAYWRIGHT_TEST_BASE_URL, and CI_PLAYWRIGHT in production."
    );
  }
}

export const suggestions = [
  "What are the advantages of using Astro?",
  "Write code to calculate Peter vs Chicken win odds",
  "Help me write an essay about my love for McDonald's",
  "What is the weather in Stockholm?",
];
