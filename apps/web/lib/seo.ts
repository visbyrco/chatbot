const DEV_FALLBACK_URL = "http://localhost:3000";

function isBuildPhase(): boolean {
  return process.env["NEXT_PHASE"] === "phase-production-build";
}

export function getSiteUrl(): string {
  const appUrl = (process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/+$/, "");
  const basePath = (process.env["NEXT_PUBLIC_BASE_PATH"] ?? "").replace(
    /\/+$/,
    ""
  );

  if (appUrl) {
    return `${appUrl}${basePath}`;
  }

  // During `next build` the runtime env is not available (Docker/Vercel
  // build-args may be empty). Never throw during build collection — fall
  // back to localhost and let runtime validation handle missing public URL.
  if (isBuildPhase()) {
    return `${DEV_FALLBACK_URL}${basePath}`;
  }

  // Demo / test mode runs without a public URL — use fallback so the
  // container and Vercel demo can start without NEXT_PUBLIC_APP_URL.
  // Also fallback when Clerk isn't configured or when preview/Hub is
  // missing DB/encryption (PR preview with Clerk keys but no POSTGRES_URL
  // or ENCRYPTION_KEY would otherwise throw 500 via lib/seo).
  if (
    process.env["DEMO_MODE"] === "1" ||
    !process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] ||
    process.env["VERCEL_ENV"] === "preview" ||
    !process.env["POSTGRES_URL"] ||
    !process.env["ENCRYPTION_KEY"]
  ) {
    return `${DEV_FALLBACK_URL}${basePath}`;
  }

  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is required for production builds so metadata resolves to the public origin."
    );
  }

  return `${DEV_FALLBACK_URL}${basePath}`;
}

export function getCanonicalUrl(path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, `${getSiteUrl()}/`).toString();
}

export function getMetadataBase(): URL {
  return new URL(`${getSiteUrl()}/`);
}
