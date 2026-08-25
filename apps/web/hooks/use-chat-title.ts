"use client";

import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { regenerateChatTitle, renameChat } from "@/app/(chat)/actions";
import { getChatHistoryPaginationKey } from "@/components/chat/sidebar-history";

export function useChatTitle({
  chatId,
  initialTitle,
}: {
  chatId: string;
  initialTitle: string;
}) {
  const { mutate } = useSWRConfig();

  const { data: localTitle, mutate: setLocalTitle } = useSWR<string | null>(
    `${chatId}-title`,
    null,
    {
      fallbackData: null,
    }
  );

  const title = localTitle ?? initialTitle;

  const setTitle = useCallback(
    async (newTitle: string) => {
      const previous = title;
      setLocalTitle(newTitle);
      mutate(unstable_serialize(getChatHistoryPaginationKey));
      try {
        await renameChat({ chatId, title: newTitle });
      } catch (error) {
        setLocalTitle(previous);
        throw error;
      }
    },
    [chatId, mutate, setLocalTitle, title]
  );

  const regenerateTitle = useCallback(async () => {
    const { title: regenerated } = await regenerateChatTitle({ chatId });
    setLocalTitle(regenerated);
    mutate(unstable_serialize(getChatHistoryPaginationKey));
    return regenerated;
  }, [chatId, mutate, setLocalTitle]);

  return { regenerateTitle, setTitle, title };
}
