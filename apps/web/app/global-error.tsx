"use client";

import { useEffect } from "react";

function isChunkLoadError(error: Error): boolean {
  const msg = error.message || "";
  return (
    msg.includes("Failed to load chunk") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk")
  );
}

// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js requires Error name
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    if (isChunkLoadError(error)) {
      const reloaded = sessionStorage.getItem("chunk-reload");
      if (!reloaded) {
        sessionStorage.setItem("chunk-reload", "1");
        window.location.reload();
      }
    }
  }, [error]);

  const isChunk = isChunkLoadError(error);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            fontFamily: "system-ui",
            gap: 16,
            justifyContent: "center",
            minHeight: "50vh",
            padding: 32,
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, maxWidth: 480, opacity: 0.7 }}>
            {isChunk
              ? "A new version was just deployed. Reloading… If this persists, hard-refresh (Ctrl+Shift+R)."
              : error.message || "An unexpected error occurred."}
          </p>
          {error.digest && !isChunk ? (
            <p style={{ fontSize: 12, opacity: 0.6 }}>
              Error ID: {error.digest}
            </p>
          ) : null}
          <button
            // biome-ignore lint/performance/noJsxPropsBind: trivial reload/reset
            onClick={() => (isChunk ? window.location.reload() : reset())}
            style={{
              background: "black",
              borderRadius: 6,
              color: "white",
              cursor: "pointer",
              fontSize: 14,
              padding: "8px 16px",
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
