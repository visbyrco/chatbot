"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/error-view";

function isChunkLoadError(error: Error): boolean {
  const msg = error.message || "";
  return (
    msg.includes("Failed to load chunk") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk")
  );
}

// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js requires Error component name
export default function Error({
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

  const isChunkError = isChunkLoadError(error);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <ErrorView
        digest={isChunkError ? undefined : error.digest}
        message={
          isChunkError
            ? "A new version was just deployed. Reloading… If this persists, hard-refresh (Ctrl+Shift+R)."
            : error.message
        }
        // biome-ignore lint/performance/noJsxPropsBind: chunk reload needs inline closure
        onReset={() => {
          if (isChunkError) {
            window.location.reload();
            return;
          }
          reset();
        }}
        title="Something went wrong"
      />
    </div>
  );
}
