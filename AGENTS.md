Visbyr Chat — Next.js 16 App Router + React 19, TypeScript, Tailwind v4, Drizzle on Postgres, optional Redis, Clerk auth, multi-provider AI via AI SDK.

## Constraints
- `pnpm build && pnpm test` before pushing; both run in CI (`e2e.yml`).
- Pre-commit is `husky` + `lint-staged`: `pnpm exec lint-staged` runs `pnpm fix --` on staged `*.{ts,tsx,js,jsx,jsonc}`. Do not end a turn with lint/format failures.

## Package manager
- `pnpm@10.32.1` only (`packageManager` pinned). No npm/yarn.

## Commands
- `pnpm install` / `pnpm dev` (Turbopack, `http://localhost:3000`) / `pnpm dev:demo` (`DEMO_MODE=1`, in-memory DB + mock AI + auto `demo@example.com`, ephemeral)
- `pnpm build` — `next build` (typecheck is inside build; `pnpm typecheck` exists for CI)
- `pnpm check` / `pnpm fix` — Ultracite (Biome) lint/format
- `pnpm test` — `cross-env PLAYWRIGHT=True playwright test`; also `pnpm exec playwright test --project=e2e` (Chromium only in CI, `firefox`/`webkit`/`mobile-chrome` locally)
- Unit tests: `pnpm exec vitest run` (config `vitest.config.ts`, matches `lib/**/*.test.ts` + `tests/unit/**/*.test.ts`, excludes `lib/ai/models.test.ts`)
- DB: `pnpm db:migrate` (`lib/db/migrate.ts`, reads `.env.local` via `dotenv`, exits 0 if `POSTGRES_URL` unset), `db:generate` / `db:studio` / `db:push` / `db:pull` / `db:check` via `drizzle-kit` (also reads `.env.local`)

## Environment
- Copy `.env.example` → `.env.local`. Loaded by `drizzle.config.ts`, `lib/db/migrate.ts`, `playwright.config.ts`.
- Required unless in demo/mock mode: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `ENCRYPTION_KEY` (`openssl rand -base64 32`), `POSTGRES_URL`.
- Optional: `REDIS_URL` (rate limiting + resumable streams), `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `XAI_API_KEY`, `NEXT_PUBLIC_APP_URL` (must be `https://` in prod unless localhost).
- `DEMO_MODE=1` bypasses Clerk/DB/keys; refuses to start in production unless `ALLOW_DEMO_IN_PROD=1` or `VERCEL_ENV=preview`. `PLAYWRIGHT` / `PLAYWRIGHT_TEST_BASE_URL` / `CI_PLAYWRIGHT` are ignored in production (`lib/constants.ts:assertProductionSecurity`).

## Auth and runtime gates
- `usesMockAuthNow()` (`lib/constants.ts:54`) is the real gate: true if `isTestEnvironmentNow()` OR `!isClerkConfiguredNow()` OR `!POSTGRES_URL` OR `VERCEL_ENV=preview`. `isTestEnvironmentNow()` (`:28`) is `DEMO_MODE` (with prod allowance) or `PLAYWRIGHT*` outside prod.
- `middleware.ts:shouldUseTestHandler` picks `handleTestRequest` vs `clerkMiddleware`; both enforce CSRF (`lib/security/csrf.ts`) and per-request CSP nonce (`buildCsp`/`x-nonce`). `/ping` always `pong` (used as Playwright `webServer.url` healthcheck).
- `app/(auth)/auth.ts:auth()` mirrors the gate: `test-user` cookie (HMAC `email|sig` with `ENCRYPTION_KEY`) in test mode, `demo-session` cookie minted in middleware for demo/Vercel-preview fallback.

## Database
- Schema `lib/db/schema.ts`, migrations `lib/db/migrations`, config `drizzle.config.ts`.
- Prod: Postgres required; dev/demo: in-memory store (`lib/db/queries.ts` branches on `isTestEnvironmentNow()`).

## Architecture
- `app/(chat)/layout.tsx:42` renders `SidebarShell` → `ChatShellWrapper` + `ActiveChatProvider`; `app/(chat)/page.tsx` and `app/(chat)/chat/[id]/page.tsx:45` return `null` (client shell owns UI). `app/layout.tsx` gates Clerk provider via `usesMockAuthNow()`.
- API routes under `app/(chat)/api/`; tools `lib/ai/tools/`, artifacts `artifacts/`.
- Providers `lib/ai/providers.ts` merges env keys with encrypted `CustomProvider` rows; catalog `lib/ai/catalog.ts` wraps `@opencode-ai/models` snapshot + live `models.dev` fetch (5s timeout, 5m live TTL, 1h persisted `CatalogSync`). Mock provider `lib/ai/models.mock.ts` used when `isTestEnvironmentNow()`.
- Security: `instrumentation.ts:register()` calls `assertProductionSecurity()` + `getEnv()` (Zod, `lib/env.ts`); skips `ENCRYPTION_KEY` check in demo/build/preview without DB.

## Testing
- Playwright `playwright.config.ts:99` `webServer: pnpm dev` with `PLAYWRIGHT=True`, `reuseExistingServer: !CI`, healthcheck `baseURL + /ping`. `pnpm test` needs no keys.
- Model-selector tests may reference DeepSeek/Kimi only present after live catalog sync.

## Docker
- `docker compose up` — app `localhost:3001`, Postgres `5433`, Redis `6380`; `docker-entrypoint.sh` migrates before start.

## Tooling quirks
- Alias `@/*` → `./*` (`tsconfig.json:22`).
- `biome.jsonc` extends `ultracite/biome/*`, excludes `components/ui` + `lib/db/migrations`.
- `next.config.ts` is `output: "standalone"`, `reactCompiler: true`, `optimizePackageImports: [framer-motion, shiki, streamdown]`; do not add static CSP (middleware sets per-request nonce CSP; static header breaks chunks).
