"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useSidebar } from "../ui/sidebar";
import { SidebarLeftIcon } from "./icons";

export function MobileSidebarToggle({ className }: { className?: string }) {
  const { openMobile, setOpenMobile } = useSidebar();

  const handleToggle = useCallback(() => {
    setOpenMobile(!openMobile);
  }, [openMobile, setOpenMobile]);

  return (
    <Button
      aria-label="Toggle Sidebar"
      className={cn(
        "flex size-9 items-center justify-center rounded-full border border-border bg-surface-container-lowest text-foreground shadow-[var(--shadow-float)] transition-all hover:border-primary/30 hover:bg-primary/10 hover:text-primary active:scale-90 md:hidden",
        className
      )}
      onClick={handleToggle}
      type="button"
      variant="ghost"
    >
      <SidebarLeftIcon size={16} />
    </Button>
  );
}
