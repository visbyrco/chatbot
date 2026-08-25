"use client";

import { PenSquareIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { SidebarLeftIcon } from "./icons";

export function MobileTopBar() {
  const { setOpenMobile, openMobile } = useSidebar();
  const router = useRouter();

  const handleToggleSidebar = useCallback(() => {
    setOpenMobile(!openMobile);
  }, [openMobile, setOpenMobile]);

  const handleNewChat = useCallback(() => {
    setOpenMobile(false);
    router.push("/");
  }, [router, setOpenMobile]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3 md:hidden">
      <div className="pointer-events-auto flex items-center overflow-hidden rounded-xl border border-border bg-surface-container-lowest shadow-[var(--shadow-float)]">
        <button
          aria-label="Toggle Sidebar"
          className="flex size-9 items-center justify-center rounded-l-xl bg-transparent text-foreground transition-colors hover:bg-primary/10 hover:text-primary active:bg-primary/15"
          data-testid="mobile-sidebar-toggle"
          onClick={handleToggleSidebar}
          type="button"
        >
          <SidebarLeftIcon size={16} />
        </button>
        <div aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
        <button
          aria-label="New Chat"
          className="flex size-9 items-center justify-center rounded-r-xl bg-transparent text-foreground transition-colors hover:bg-primary/10 hover:text-primary active:bg-primary/15"
          data-testid="mobile-new-chat-button"
          onClick={handleNewChat}
          type="button"
        >
          <PenSquareIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
