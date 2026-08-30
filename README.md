# Visbyr Chat

A multi-provider AI chatbot built with Next.js, the AI SDK, and Drizzle ORM. Supports OpenAI, Anthropic, Google, xAI, and user-configured custom providers.

## Features

- **Multi-provider AI chat** — Add providers (OpenAI, Anthropic, or any OpenAI-compatible endpoint) with encrypted API keys
- **Model catalog** — Automatic model discovery with capability detection (tools, vision, reasoning)
- **Streaming with resumption** — Resumable streams across reconnects via Redis
- **Tool system** — Web search, URL fetch, weather, document create/edit/update, writing suggestions, and Python execution
- **Artifacts** — In-app code, text, spreadsheet, and image artifacts with live editing and versioning
- **Rich text editor** — ProseMirror-based document editing
- **Reasoning effort control** — Per-model reasoning levels (none through max)
- **User settings** — Customizable themes, fonts, default model, tool enable/disable, enter behavior
- **Demo mode** — Zero-dependency mode with in-memory DB, mock AI, and auto-auth for quick previews
- **Rate limiting** — IP-based (Redis) and per-user configurable rate limits
- **Export** — Chat and attachment export to markdown
- **Mobile support** — Mobile-specific keyboard layouts, message actions, and sidebar toggle
- **Legal pages** — Privacy policy and terms of service

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4, shadcn/ui (Radix UI primitives)
- **AI:** [AI SDK](https://ai-sdk.dev) v7 with streaming, tool use, and reasoning effort control
- **Database:** Postgres via [Drizzle ORM](https://orm.drizzle.team)
- **Cache:** Redis (optional — rate limiting and stream resumption)
- **Auth:** [Clerk](https://clerk.com) (hosted sign-in; chat requires a signed-in account)
- **Python:** Pyodide (in-browser Python execution)
- **Editor:** ProseMirror (rich text), CodeMirror (code artifacts)

## Prerequisites

- Node.js 20+
- `pnpm` 10.32.1 (`corepack enable`)
- Postgres (or Docker Compose)
- At least one AI provider API key (OpenAI, Anthropic, Google, or xAI)

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (dashboard.clerk.com) |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Clerk hosted sign-in/up page URLs |
| `NEXT_PUBLIC_APP_URL` | Production origin used for canonical URLs and social images |
| `ENCRYPTION_KEY` | Random secret for encrypting provider API keys (`openssl rand -base64 32`) |
| `POSTGRES_URL` | Postgres connection string |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `XAI_API_KEY` | At least one provider key |

Optional:

| Variable | Description |
|---|---|
| `REDIS_URL` | Enables rate limiting and stream resumption |
| `MAX_MESSAGES_PER_HOUR` | Rate limit for logged-in users (default 100, clamped 1–10000) |
| `DEMO_MODE` | Set to `1` for zero-dependency demo mode (no Postgres, Redis, Clerk, or API keys needed) |

### 3. Run database migrations

```bash
pnpm db:migrate
```

### 4. Start the dev server

```bash
pnpm dev
```

App runs at [localhost:3000](http://localhost:3000).

## Docker Compose

Runs the full stack (app + Postgres + Redis):

```bash
docker compose up
```

- App: `localhost:3001`
- Postgres: `localhost:5433`
- Redis: `localhost:6380`

Migrations run automatically on container start.

> **Self-hosting behind nginx:** if you proxy to the app with nginx (as on
> `server.hkjc.uk` for `chat.visbyr.com`), raise the upload limit. Nginx
> defaults to `client_max_body_size 1m` and will return `413 Request Entity Too
> Large` for files over 1 MB even though the app allows up to 500 MB. Add `client_max_body_size 500m;` inside the
> `server { }` block and reload (`nginx -t && systemctl reload nginx`). See
> `docs/nginx.conf.example` for a full example. The Next.js middleware clone
> limit is already raised to 550 MB via `experimental.proxyClientMaxBodySize` in
> `next.config.ts`. Vercel preview is not affected.

## Demo Mode (no external services)

Set `DEMO_MODE=1` to run the app with **zero dependencies** — no Postgres, no
Redis, no Clerk keys, and no AI provider keys. It uses a full in-memory store
(seeded with a mock provider/model), the mock AI provider, and auto-signs in a
`demo@example.com` user. Use it to test the UI quickly or preview on Vercel.

```bash
pnpm dev:demo
```

On Vercel: import the repo and deploy from any branch, then set only
`DEMO_MODE=1` and `NEXT_PUBLIC_APP_URL=https://<your-domain>` as env vars.
Do **not** set `POSTGRES_URL`, `ENCRYPTION_KEY`, or Clerk/Redis keys.

> Note: in-memory data is ephemeral — it resets on restart and is per-instance
> on serverless deployments, so chats are not durable. This is a UI demo, not a
> production data store.

## Model Providers

Built-in providers are resolved via API keys in `.env.local`. Users can also add custom OpenAI-compatible providers at runtime through the settings UI — these are stored in Postgres and resolved dynamically.

Model capabilities (tools, vision, reasoning) are defined in the catalog at `lib/ai/catalog.ts`.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Dev server with Turbopack |
| `pnpm dev:demo` | Dev server in demo mode (in-memory DB, mock AI, auto-auth) |
| `pnpm build` | Production build (includes type checking) |
| `pnpm check` | Lint (Ultracite/Biome) |
| `pnpm fix` | Auto-fix lint issues |
| `pnpm test` | Playwright e2e tests (sets `PLAYWRIGHT=True` for mock AI) |
| `pnpm db:migrate` | Run Drizzle migrations |
| `pnpm db:generate` | Generate migration files |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm db:push` | Push schema to database |
| `pnpm db:pull` | Pull schema from database |
| `pnpm db:check` | Check schema drift |

## Testing

E2E tests use Playwright. The mock AI provider is activated via `PLAYWRIGHT=True`, so no real API keys are needed.

```bash
pnpm test
```

## Project Structure

```
app/(chat)/                # Chat UI, API routes, and settings
app/(auth)/auth.ts         # Session helper (Clerk-backed, mocked under Playwright)
app/(legal)/               # Privacy policy and terms of service
artifacts/                 # Server actions and rendering for code, text, sheet, image artifacts
components/
  ai-elements/             # AI response rendering (markdown, code, reasoning, tools)
  chat/                    # Chat UI (sidebar, messages, input, toolbar, slash commands)
  settings/                # Settings UI (providers, models, tools, preferences)
  ui/                      # shadcn/ui primitives
hooks/                     # React hooks (chat state, scroll, mobile, viewport)
lib/ai/                    # Model catalog, providers, prompts, tools
lib/db/                    # Drizzle schema, migrations, queries, in-memory store
lib/editor/                # ProseMirror-based rich text editor
lib/export/                # Chat and attachment export
tests/e2e/                 # Playwright tests
```

## License

Apache 2.0 — © 2024 Vercel, Inc. · © 2026 Vilhelm Gain
