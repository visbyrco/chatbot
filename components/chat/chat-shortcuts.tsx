"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ChatShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || !event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "o") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      router.push("/");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return null;
}
