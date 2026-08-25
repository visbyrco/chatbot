"use client";

import { usePathname } from "next/navigation";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { ChatShell } from "./shell";

function VisualViewportVars() {
  useVisualViewport();
  return null;
}

export function ChatShellWrapper() {
  const pathname = usePathname();
  if (pathname?.startsWith("/settings")) {
    return <VisualViewportVars />;
  }
  return <ChatShell />;
}
