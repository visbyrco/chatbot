"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/error-view";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <ErrorView
        digest={error.digest}
        message={error.message}
        onReset={reset}
        title="Chat failed to load"
      />
    </div>
  );
}
