"use client";

import { PenSquareIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { User } from "@/app/(auth)/auth";
import { ChatMonoLogo } from "@/components/chat/chat-logo";
import { SidebarHistory } from "@/components/chat/sidebar-history";
import { SidebarUserNav } from "@/components/chat/sidebar-user-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "../ui/button";

function CollapsedSidebarToggle() {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      aria-label="Toggle Sidebar"
      className="size-8 p-0 text-sidebar-foreground/70 hover:text-sidebar-foreground"
      data-testid="sidebar-toggle-button"
      onClick={toggleSidebar}
      size="icon-sm"
      variant="ghost"
    >
      <ChatMonoLogo className="size-4 shrink-0" size={16} />
    </Button>
  );
}

export function AppSidebar({
  testEnvironment,
  user,
}: {
  testEnvironment: boolean;
  user: User | undefined;
}) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const [searchQuery, setSearchQuery] = useState("");

  const closeMobile = useCallback(() => {
    setOpenMobile(false);
  }, [setOpenMobile]);

  const handleNewChat = useCallback(() => {
    setOpenMobile(false);
    router.push("/");
  }, [router, setOpenMobile]);

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(event.target.value);
    },
    []
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pb-0 pt-3">
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-row items-center justify-between">
            <div className="group-data-[collapsible=icon]:hidden">
              <SidebarMenuButton
                asChild
                className="size-8 !px-0 items-center justify-center"
                tooltip="Chatbot"
              >
                <Link href="/" onClick={closeMobile}>
                  <ChatMonoLogo className="size-5 shrink-0" size={20} />
                </Link>
              </SidebarMenuButton>
            </div>
            <div className="hidden size-8 items-center justify-center group-data-[collapsible=icon]:flex">
              <CollapsedSidebarToggle />
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <SidebarTrigger className="text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="pt-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="h-9 rounded-lg border border-input bg-foreground/5 text-[14px] text-sidebar-foreground/80 transition-colors duration-150 hover:bg-primary/10 hover:border-primary/30 hover:text-sidebar-foreground"
                  onClick={handleNewChat}
                  tooltip="New Chat"
                >
                  <PenSquareIcon className="size-4" />
                  <span className="font-medium">New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {user ? (
                <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                  <div className="relative w-full">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-sidebar-foreground/40" />
                    <SidebarInput
                      aria-label="Search chats"
                      className="h-8 rounded-lg bg-foreground/[0.04] pr-8 pl-8 text-[13px] placeholder:text-sidebar-foreground/40 focus-visible:ring-1 focus-visible:ring-sidebar-ring"
                      data-testid="thread-search-input"
                      onChange={handleSearchChange}
                      placeholder="Search chats..."
                      value={searchQuery}
                    />
                    {searchQuery ? (
                      <button
                        aria-label="Clear search"
                        className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/40 transition-colors hover:bg-foreground/10 hover:text-sidebar-foreground"
                        onClick={handleClearSearch}
                        type="button"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarHistory searchQuery={searchQuery} user={user} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border pt-2 pb-3">
        {user ? (
          <SidebarUserNav testEnvironment={testEnvironment} user={user} />
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
