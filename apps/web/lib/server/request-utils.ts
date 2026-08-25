export function getClientIp(request: Request): string | undefined {
  const trustedProxies = process.env.TRUSTED_PROXIES;
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  // When behind a trusted proxy (e.g. nginx, Cloudflare, Vercel with
  // TRUSTED_PROXIES set), x-forwarded-for is appended by the proxy and the
  // first entry is the original client IP.
  if (forwarded && trustedProxies && trustedProxies.length > 0) {
    const first = forwarded.split(",")[0].trim();
    if (first) {
      return first;
    }
  }

  // Prefer x-real-ip when available — it is set by trusted reverse proxies
  // and is less spoofable than x-forwarded-for.
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) {
      return trimmed;
    }
  }
}

export function getRequestHints(request: Request) {
  return {
    city: null as string | null,
    // cf-ipcountry is an ISO 3166-1 alpha-2 country code (e.g. "US") and is
    // only an approximation of the caller's location. latitude/longitude/city
    // are currently never populated (no geo-IP lookup is wired up).
    country: request.headers.get("cf-ipcountry") ?? null,
    latitude: null as number | null,
    longitude: null as number | null,
  };
}
