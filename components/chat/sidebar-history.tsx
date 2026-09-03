"use client";

import { isToday, isYesterday, subMonths, subWeeks } from "date-fns";
import { motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWRInfinite from "swr/infinite";
import type { User } from "@/app/(auth)/auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import type { Chat } from "@/lib/db/schema";
import { fetcher } from "@/lib/utils";
import { LoaderIcon } from "./icons";
import { ChatItem } from "./sidebar-history-item";

type GroupedChats = {
  today: Chat[];
  yesterday: Chat[];
  lastWeek: Chat[];
  lastMonth: Chat[];
  older: Chat[];
};

export type ChatHistory = {
  chats: Chat[];
  hasMore: boolean;
};

const PAGE_SIZE = 20;

const groupChatsByDate = (chats: Chat[]): GroupedChats => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      const chatDate = new Date(chat.updatedAt);

      if (isToday(chatDate)) {
        groups.today.push(chat);
      } else if (isYesterday(chatDate)) {
        groups.yesterday.push(chat);
      } else if (chatDate > oneWeekAgo) {
        groups.lastWeek.push(chat);
      } else if (chatDate > oneMonthAgo) {
        groups.lastMonth.push(chat);
      } else {
        groups.older.push(chat);
      }

      return groups;
    },
    {
      lastMonth: [],
      lastWeek: [],
      older: [],
      today: [],
      yesterday: [],
    } as GroupedChats
  );
};

export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory
) {
  if (previousPageData && previousPageData.hasMore === false) {
    return null;
  }

  if (pageIndex === 0) {
    return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history?limit=${PAGE_SIZE}`;
  }

  const firstChatFromPage = previousPageData.chats.at(-1);

  if (!firstChatFromPage) {
    return null;
  }

  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history?ending_before=${firstChatFromPage.id}&limit=${PAGE_SIZE}`;
}

export function SidebarHistory({
  searchQuery = "",
  user,
}: {
  searchQuery?: string;
  user: User | undefined;
}) {
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const id = pathname?.startsWith("/chat/") ? pathname.split("/")[2] : null;

  const {
    data: paginatedChatHistories,
    setSize,
    isValidating,
    isLoading,
    mutate,
    error,
  } = useSWRInfinite<ChatHistory>(
    user ? getChatHistoryPaginationKey : () => null,
    fetcher,
    {
      dedupingInterval: 1000,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
      keepPreviousData: true,
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      shouldRetryOnError: (err: unknown) => {
        const e = err as { statusCode?: number; type?: string };
        if (e?.statusCode === 429 || e?.type === "rate_limit") {
          return false;
        }
        return true;
      },
    }
  );

  // Cross-tab instant sync via BroadcastChannel + storage fallback
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("chat-history");
      channel.onmessage = () => {
        mutate();
      };
      // biome-ignore lint/suspicious/noEmptyBlockStatements: broadcast not supported in some browsers
    } catch {}

    const onStorage = (e: StorageEvent) => {
      if (e.key === "chat-history-ping") {
        mutate();
      }
    };
    window.addEventListener("storage", onStorage);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        mutate();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      try {
        channel?.close();
        // biome-ignore lint/suspicious/noEmptyBlockStatements: close may throw if already closed
      } catch {}
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [mutate]);

  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const hasReachedEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyChatHistory =
    !isLoading &&
    !error &&
    !!paginatedChatHistories &&
    paginatedChatHistories.length > 0 &&
    paginatedChatHistories.every((page) => page.chats.length === 0);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;

  const filteredChats = useMemo(() => {
    if (!paginatedChatHistories) {
      return null;
    }
    const allChats = paginatedChatHistories.flatMap(
      (paginatedChatHistory) => paginatedChatHistory.chats
    );
    if (!isSearching) {
      return allChats;
    }
    return allChats.filter((chat) =>
      chat.title.toLowerCase().includes(normalizedSearch)
    );
  }, [isSearching, normalizedSearch, paginatedChatHistories]);

  const groupedChats = useMemo(() => {
    if (!filteredChats) {
      return null;
    }
    return groupChatsByDate(filteredChats);
  }, [filteredChats]);

  const handleDelete = useCallback(() => {
    const chatToDelete = deleteId;
    const isCurrentChat = pathname === `/chat/${chatToDelete}`;

    setShowDeleteDialog(false);

    if (isCurrentChat) {
      router.replace("/");
    }

    mutate((chatHistories) => {
      if (chatHistories) {
        return chatHistories.map((chatHistory) => ({
          ...chatHistory,
          chats: chatHistory.chats.filter((chat) => chat.id !== chatToDelete),
        }));
      }
    });

    fetch(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat?id=${chatToDelete}`,
      { method: "DELETE" }
    );

    toast.success("Chat deleted");
  }, [deleteId, mutate, pathname, router]);

  const handleShowDeleteDialog = useCallback((chatId: string) => {
    setDeleteId(chatId);
    setShowDeleteDialog(true);
  }, []);

  const handleViewportEnter = useCallback(() => {
    if (!isValidating && !hasReachedEnd) {
      setSize((size) => size + 1);
    }
  }, [hasReachedEnd, isValidating, setSize]);

  const handleNewChat = useCallback(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    window.location.href = `${base}/`;
  }, []);

  const handleRetry = useCallback(() => {
    mutate();
  }, [mutate]);

  if (!user) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupContent>
          <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="size-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[14px] font-medium text-sidebar-foreground">
                Save your chats
              </p>
              <p className="text-[13px] leading-5 text-sidebar-foreground/60">
                Login to save and revisit previous chats!
              </p>
            </div>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (error) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
          History
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col gap-2 px-4 py-6">
            <p className="text-[13px] text-muted-foreground">
              Failed to load history
            </p>
            <Button onClick={handleRetry} size="sm" variant="outline">
              Retry
            </Button>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
          History
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col gap-1.5 px-1">
            {[0, 1, 2, 3, 4].map((item) => (
              <Skeleton
                className="h-8 w-full rounded-lg"
                key={item}
              />
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (hasEmptyChatHistory) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
          History
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="size-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[14px] font-medium text-sidebar-foreground">
                No chats yet
              </p>
              <p className="text-[13px] leading-5 text-sidebar-foreground/60">
                Your conversations will appear here once you start chatting!
              </p>
            </div>
            <Button
              className="mt-1"
              onClick={handleNewChat}
              size="sm"
              variant="outline"
            >
              Start new chat
            </Button>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isSearching && filteredChats && filteredChats.length === 0) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
          History
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <p className="text-[13px] font-medium text-sidebar-foreground/80">
              No results
            </p>
            <p className="text-[12px] leading-5 text-sidebar-foreground/50">
              No chats found for &quot;{searchQuery.trim()}&quot;.
            </p>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
          History
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {groupedChats && (
              <div className="flex flex-col gap-4">
                {groupedChats.today.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-primary">
                      Today
                    </div>
                    {groupedChats.today.map((chat, index) => (
                      <ChatItem
                        chat={chat}
                        enterDelay={Math.min(index, 8) * 25}
                        isActive={chat.id === id}
                        key={chat.id}
                        onDelete={handleShowDeleteDialog}
                        setOpenMobile={setOpenMobile}
                      />
                    ))}
                  </div>
                )}

                {groupedChats.yesterday.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-primary">
                      Yesterday
                    </div>
                    {groupedChats.yesterday.map((chat, index) => (
                      <ChatItem
                        chat={chat}
                        enterDelay={Math.min(index, 8) * 25}
                        isActive={chat.id === id}
                        key={chat.id}
                        onDelete={handleShowDeleteDialog}
                        setOpenMobile={setOpenMobile}
                      />
                    ))}
                  </div>
                )}

                {groupedChats.lastWeek.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-primary">
                      Previous 7 days
                    </div>
                    {groupedChats.lastWeek.map((chat, index) => (
                      <ChatItem
                        chat={chat}
                        enterDelay={Math.min(index, 8) * 25}
                        isActive={chat.id === id}
                        key={chat.id}
                        onDelete={handleShowDeleteDialog}
                        setOpenMobile={setOpenMobile}
                      />
                    ))}
                  </div>
                )}

                {groupedChats.lastMonth.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-primary">
                      Previous 30 days
                    </div>
                    {groupedChats.lastMonth.map((chat, index) => (
                      <ChatItem
                        chat={chat}
                        enterDelay={Math.min(index, 8) * 25}
                        isActive={chat.id === id}
                        key={chat.id}
                        onDelete={handleShowDeleteDialog}
                        setOpenMobile={setOpenMobile}
                      />
                    ))}
                  </div>
                )}

                {groupedChats.older.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-primary">
                      Older
                    </div>
                    {groupedChats.older.map((chat, index) => (
                      <ChatItem
                        chat={chat}
                        enterDelay={Math.min(index, 8) * 25}
                        isActive={chat.id === id}
                        key={chat.id}
                        onDelete={handleShowDeleteDialog}
                        setOpenMobile={setOpenMobile}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </SidebarMenu>

          <motion.div onViewportEnter={handleViewportEnter} />

          {hasReachedEnd ? null : (
            <div className="mt-1 flex flex-row items-center gap-2 px-4 py-2 text-sidebar-foreground/50">
              <div className="animate-spin">
                <LoaderIcon />
              </div>
              <div className="text-[11px]">Loading...</div>
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              chat and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
