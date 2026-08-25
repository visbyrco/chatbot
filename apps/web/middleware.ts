import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  isClerkConfiguredNow,
  isDemoModeNow,
  isProductionEnvironmentNow,
  usesMockAuthNow,
} from "./lib/constants";
import { isCsrfOriginAllowed } from "./lib/security/csrf";

const isProtectedRoute = createRouteMatcher([
  "/",
  "/chat/:id",
  "/settings",
  "/api/:path*",
  "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|sitemap.xml|robots.txt|privacy|terms).*)",
]);

function handlePing(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }
  return null;
}

function generateNonce(): string {
  try {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    let binary = "";
    for (const byte of array) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

function getClerkFrontendApiHosts(): string[] {
  const hosts = new Set<string>();
  // Env-provided domain (satellite / custom). Read via bracket to avoid inlining.
  for (const key of [
    "NEXT_PUBLIC_CLERK_DOMAIN",
    "NEXT_PUBLIC_CLERK_FRONTEND_API",
    "CLERK_FRONTEND_API",
    "CLERK_DOMAIN",
  ] as const) {
    const raw = process.env[key as string];
    if (raw) {
      const host = raw
        .replace(/^https?:\/\//, "")
        .split("/")[0]
        .trim();
      if (host) {
        hosts.add(host);
      }
    }
  }
  // Derive frontendApi host from publishableKey: pk_live_<base64(host$)>
  const pk = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];
  if (pk) {
    const parts = pk.split("_");
    const b64 = parts.at(-1);
    if (b64) {
      try {
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        // atob is available in edge; Buffer fallback for node
        const decoded =
          typeof atob === "function"
            ? atob(padded)
            : Buffer.from(padded, "base64").toString("utf-8");
        const host = decoded.replace(/\$/g, "").trim();
        if (host.includes(".")) {
          hosts.add(host);
        }
      } catch {
        // ignore malformed key
      }
    }
  }
  // Deterministic fallback for this deployment's custom domain. Even if env
  // parsing fails, the CSP must allow the known instance. Adding it
  // unconditionally is safe and idempotent.
  hosts.add("clerk.chat.visbyr.com");
  return [...hosts];
}

function buildCsp(nonce: string): string {
  const clerkHosts = getClerkFrontendApiHosts();
  const clerkOrigins = clerkHosts.map((h) => `https://${h}`).join(" ");
  const clerkWildcards = clerkHosts.map((h) => `https://*.${h}`).join(" ");
  // Also keep legacy clerk.com wildcards for non-custom deployments.
  const clerkConnect = [
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
    clerkOrigins,
    clerkWildcards,
  ]
    .filter(Boolean)
    .join(" ");
  const clerkFrame = clerkConnect;
  const clerkImg = [
    "https://img.clerk.com",
    "https://images.clerk.dev",
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
    clerkOrigins,
    clerkWildcards,
  ].join(" ");
  const clerkScript = clerkConnect;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.jsdelivr.net ${clerkScript} 'sha256-eMuh8xiwcX72rRYNAGENurQBAcH7kLlAUQcoOri3BIo='`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob: ${clerkImg} https://*.googleusercontent.com https://*.githubusercontent.com https://*.gravatar.com https://models.dev`,
    "font-src 'self' data:",
    `connect-src 'self' ${clerkConnect} https://cdn.jsdelivr.net`,
    // Clerk prebuilt components (<UserProfile>, <UserButton>) render inside a
    // cross-origin iframe hosted on the Clerk instance domain.
    `frame-src 'self' ${clerkFrame}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "worker-src 'self' blob:",
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  if (isProductionEnvironmentNow()) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }
  const csp = buildCsp(nonce);
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-nonce", nonce);
}

// Next.js SSR extracts its script nonce from the CSP *request* header
// (app-render reads headers['content-security-policy']; it never reads
// 'x-nonce'). Without it, framework scripts render without a nonce and are
// blocked by the response CSP under 'strict-dynamic' — killing all client JS,
// including Clerk's.
function prepareRequestHeaders(request: NextRequest, nonce: string): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", buildCsp(nonce));
  return requestHeaders;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function handleCsrf(request: NextRequest): Response | null {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return null;
  }
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const isServerAction = request.headers.has("next-action");
  if (!isApiRoute && !isServerAction) {
    return null;
  }
  if (!isCsrfOriginAllowed(request)) {
    return new Response(
      JSON.stringify({ code: "forbidden", message: "CSRF origin mismatch" }),
      {
        headers: { "content-type": "application/json" },
        status: 403,
      }
    );
  }
  return null;
}

function handleTestRequest(request: NextRequest): NextResponse | Response {
  const ping = handlePing(request);
  if (ping) {
    const nonce = generateNonce();
    applySecurityHeaders(ping as unknown as NextResponse, nonce);
    return ping;
  }

  const csrfResponse = handleCsrf(request);
  if (csrfResponse) {
    return csrfResponse;
  }

  // Demo/test auth handling (from PR134) — mint demo session if needed
  // Treat missing Clerk config, missing DB, or Vercel preview as demo so
  // PR preview without POSTGRES_URL stays usable even when Clerk keys exist.
  // Use bracket notation for env to avoid Next.js inlining issues (same fix
  // as lib/constants.ts for Docker Hub runtime env).
  const useDemoAuth =
    isDemoModeNow() ||
    !isClerkConfiguredNow() ||
    !process.env["POSTGRES_URL"] ||
    process.env["VERCEL_ENV"] === "preview";
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  if (isApiRoute && isProtectedRoute(request)) {
    const hasTestCookie = request.cookies.has("test-user");
    const hasDemoCookie = request.cookies.has("demo-session");
    if (!hasTestCookie && !useDemoAuth) {
      return NextResponse.json(
        {
          code: "unauthorized:chat",
          message:
            "You need to sign in to view this chat. Please sign in and try again.",
        },
        { status: 401 }
      );
    }
    if (useDemoAuth && !hasTestCookie && !hasDemoCookie) {
      const demoEmail = `demo-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}@demo.local`;
      const nonce = generateNonce();
      const res = NextResponse.next({
        request: { headers: prepareRequestHeaders(request, nonce) },
      });
      res.cookies.set("demo-session", demoEmail, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
        sameSite: "lax",
        secure: process.env["NODE_ENV"] === "production",
      });
      applySecurityHeaders(res, nonce);
      return res;
    }
  } else if (useDemoAuth && isProtectedRoute(request)) {
    const hasTestCookie = request.cookies.has("test-user");
    const hasDemoCookie = request.cookies.has("demo-session");
    if (!hasTestCookie && !hasDemoCookie) {
      const demoEmail = `demo-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}@demo.local`;
      const nonce = generateNonce();
      const res = NextResponse.next({
        request: { headers: prepareRequestHeaders(request, nonce) },
      });
      res.cookies.set("demo-session", demoEmail, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
        sameSite: "lax",
        secure: process.env["NODE_ENV"] === "production",
      });
      applySecurityHeaders(res, nonce);
      return res;
    }
  }

  const nonce = generateNonce();
  const response = NextResponse.next({
    request: { headers: prepareRequestHeaders(request, nonce) },
  });
  applySecurityHeaders(response, nonce);
  return response;
}

const testHandler = (request: NextRequest) => handleTestRequest(request);

// Computed per-request so images built without env vars (Docker Hub) still
// respect the runtime environment.
function shouldUseTestHandler(): boolean {
  return usesMockAuthNow();
}

const clerkHandler = clerkMiddleware(async (auth, request: NextRequest) => {
  const pingResponse = handlePing(request);
  if (pingResponse) {
    const nonce = generateNonce();
    applySecurityHeaders(pingResponse as unknown as NextResponse, nonce);
    return pingResponse;
  }

  const csrfResponse = handleCsrf(request);
  if (csrfResponse) {
    return csrfResponse;
  }

  if (isProtectedRoute(request)) {
    await auth.protect();
  }

  const nonce = generateNonce();
  const response = NextResponse.next({
    request: { headers: prepareRequestHeaders(request, nonce) },
  });
  applySecurityHeaders(response, nonce);
  return response;
});

function withMiddlewareErrorHandling(
  handler: (
    request: NextRequest
  ) => Promise<NextResponse | Response> | NextResponse | Response
) {
  return async (request: NextRequest) => {
    try {
      const result = await handler(request);
      return result;
    } catch (err) {
      console.error("[middleware] handler failed", err);
      if (isDemoModeNow() || !isClerkConfiguredNow()) {
        try {
          return handleTestRequest(request);
        } catch {
          // Intentional: fall through to the generic 500 response below.
        }
      }
      // Return a response instead of throwing — throwing causes Vercel's
      // MIDDLEWARE_INVOCATION_FAILED 500 page. 500 JSON keeps the edge
      // function alive and surfaces the error in logs.
      return new Response(
        JSON.stringify({ code: "internal", message: "Middleware error" }),
        { headers: { "content-type": "application/json" }, status: 500 }
      );
    }
  };
}

const wrappedTest = withMiddlewareErrorHandling(
  testHandler as unknown as (r: NextRequest) => Promise<NextResponse | Response>
);
const wrappedClerk = withMiddlewareErrorHandling(
  clerkHandler as unknown as (
    r: NextRequest
  ) => Promise<NextResponse | Response>
);

export default function middleware(request: NextRequest) {
  return shouldUseTestHandler() ? wrappedTest(request) : wrappedClerk(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|sitemap.xml|robots.txt).*)",
  ],
};
