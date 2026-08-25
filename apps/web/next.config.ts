import path from "node:path";

import type { NextConfig } from "next";

const basePath = process.env.IS_DEMO === "1" ? "/demo" : "";

const nextConfig: NextConfig = {
  ...(basePath
    ? {
        assetPrefix: "/demo-assets",
        basePath,
        redirects: async () => [
          {
            basePath: false,
            destination: basePath,
            permanent: false,
            source: "/",
          },
        ],
      }
    : {}),
  devIndicators: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  experimental: {
    optimizePackageImports: ["framer-motion", "shiki", "streamdown"],
  },
  async headers() {
    // Content-Security-Policy is set dynamically per-request with a nonce
    // in middleware.ts (buildCsp + x-nonce). Do NOT set a static CSP here —
    // a static header would be sent alongside the nonce header on HTML
    // responses, and browsers enforce *all* CSP headers (intersection). A
    // static `script-src 'unsafe-inline'` without the nonce would block the
    // nonced scripts and dynamically-imported chunks, surfacing as
    // "Failed to load chunk ..." / ChunkLoadError after a deployment.
    return [
      {
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
        source: "/(.*)",
      },
    ];
  },
  images: {
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        hostname: "localhost",
      },
      {
        hostname: "127.0.0.1",
      },
      {
        hostname: "img.clerk.com",
        protocol: "https",
      },
      {
        hostname: "images.clerk.dev",
        protocol: "https",
      },
      {
        hostname: "models.dev",
        protocol: "https",
      },
      {
        hostname: "*.clerk.com",
        protocol: "https",
      },
      {
        hostname: "*.clerk.accounts.dev",
        protocol: "https",
      },
      {
        hostname: "clerk.chat.visbyr.com",
        protocol: "https",
      },
      {
        hostname: "*.visbyr.com",
        protocol: "https",
      },
      {
        hostname: "*.googleusercontent.com",
        protocol: "https",
      },
      {
        hostname: "*.githubusercontent.com",
        protocol: "https",
      },
      {
        hostname: "*.gravatar.com",
        protocol: "https",
      },
    ],
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
    incomingRequests: false,
  },
  output: "standalone",
  // Keep tracing root at repo root for monorepo (apps/web -> ../..).
  // The path import is only for this static config; ignore for NFT tracing.
  outputFileTracingRoot: path.join(
    /* turbopackIgnore: true */ import.meta.dirname,
    "../.."
  ),
  poweredByHeader: false,
  reactCompiler: true,
};

export default nextConfig;
