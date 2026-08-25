import { isTestEnvironment } from "@/lib/constants";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getExpectedHosts(request: Request): Set<string> {
  const hosts = new Set<string>();

  const hostHeader = request.headers.get("host");
  if (hostHeader) {
    hosts.add(hostHeader.toLowerCase());
    // host may include port; also add without port
    const withoutPort = hostHeader.split(":")[0].toLowerCase();
    hosts.add(withoutPort);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const first = forwardedHost.split(",")[0].trim().toLowerCase();
    if (first) {
      hosts.add(first);
      hosts.add(first.split(":")[0]);
    }
  }

  const appUrl = process.env["NEXT_PUBLIC_APP_URL"];
  if (appUrl) {
    try {
      const url = new URL(appUrl);
      hosts.add(url.host.toLowerCase());
      hosts.add(url.hostname.toLowerCase());
    } catch {
      // ignore invalid URL
    }
  }

  return hosts;
}

function getHeaderHost(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

export function isCsrfOriginAllowed(request: Request): boolean {
  // Safe methods do not need CSRF protection
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return true;
  }

  // In test env, bypass to keep Playwright e2e working without Origin.
  // Aligned with lib/constants.ts isTestEnvironment (any PLAYWRIGHT flag when !production)
  // plus NODE_ENV==="test" for Vitest. DEMO_MODE bypass is covered by isTestEnvironment.
  if (process.env["NODE_ENV"] === "test" || isTestEnvironment) {
    return true;
  }

  const expectedHosts = getExpectedHosts(request);
  if (expectedHosts.size === 0) {
    // No expected host known — fall back to requiring Origin/Referer presence
    return false;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const secFetchSite = request.headers.get("sec-fetch-site");

  // Prefer Origin header
  if (origin) {
    const originHost = getHeaderHost(origin);
    if (!originHost) {
      return false;
    }
    // Allow if origin host matches expected hosts
    if (
      expectedHosts.has(originHost) ||
      expectedHosts.has(originHost.split(":")[0])
    ) {
      return true;
    }
    return false;
  }

  // Fallback to Referer
  if (referer) {
    const refererHost = getHeaderHost(referer);
    if (!refererHost) {
      return false;
    }
    if (
      expectedHosts.has(refererHost) ||
      expectedHosts.has(refererHost.split(":")[0])
    ) {
      return true;
    }
    return false;
  }

  // No Origin or Referer — use Sec-Fetch-Site as hint
  // same-origin / same-site without headers is suspicious for cookie-auth POST
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") {
    return true;
  }

  return false;
}

export function validateCsrfOrThrow(request: Request): Response | null {
  if (isCsrfOriginAllowed(request)) {
    return null;
  }
  return new Response(
    JSON.stringify({ code: "forbidden", message: "CSRF origin mismatch" }),
    {
      headers: { "content-type": "application/json" },
      status: 403,
    }
  );
}
