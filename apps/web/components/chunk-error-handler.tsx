"use client";

import { useEffect } from "react";

function isChunkLoadError(message: string): boolean {
  return (
    message.includes("Failed to load chunk") ||
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("Loading CSS chunk")
  );
}

export function ChunkErrorHandler() {
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      const msg = event.message || "";
      if (isChunkLoadError(msg)) {
        const reloaded = sessionStorage.getItem("chunk-reload");
        if (!reloaded) {
          sessionStorage.setItem("chunk-reload", "1");
          window.location.reload();
        }
        event.preventDefault();
      }
    };

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason =
        (event.reason as Error)?.message || String(event.reason || "");
      if (isChunkLoadError(reason)) {
        const reloaded = sessionStorage.getItem("chunk-reload");
        if (!reloaded) {
          sessionStorage.setItem("chunk-reload", "1");
          window.location.reload();
        }
        event.preventDefault();
      }
    };

    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", rejectionHandler);

    // Clear reload flag on successful load
    const clearFlag = () => sessionStorage.removeItem("chunk-reload");
    window.addEventListener("load", clearFlag);

    return () => {
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
      window.removeEventListener("load", clearFlag);
    };
  }, []);

  return null;
}
