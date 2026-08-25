# @repo/android — Expo placeholder

Scaffold for the companion Android app. This package currently contains a minimal Expo project that imports `@repo/shared` contracts so it builds and type-checks from day one.

## Getting started

```bash
pnpm install
pnpm --filter @repo/android dev
```

## Decisions locked

- **Stack**: Expo / React Native (`apps/android` imports `@repo/shared` directly).
- **Package**: `com.t3.chatbot`, scheme `chatbot`, slug `chatbot`.

## Runtime notes

- **API base**: set `extra.apiBaseUrl` in `app.json` or `EXPO_PUBLIC_API_BASE_URL`. Default `http://localhost:3000` (host-mapped Next.js dev). On device use your machine LAN IP or tunnel.
- **Auth**: `@clerk/clerk-expo` + `expo-secure-store` for session tokens (native). Web Clerk keys (`@clerk/nextjs`) stay in `apps/web` only.
- **Streaming**: AI SDK `useChat` SSE over `fetch` + `expo/fetch` polyfill; resumable streams via `POST /api/chat` + Redis.
- **Uploads**: `expo-document-picker` + `expo-file-system` → `POST /api/files/upload`.

## What remains to build

- Auth screens (Clerk Expo), chat list/detail, SSE message loop, artifact viewers, offline cache.
- The placeholder `App.tsx` intentionally fails noisily if `@repo/shared` contracts drift — fix contracts first, then UI.
