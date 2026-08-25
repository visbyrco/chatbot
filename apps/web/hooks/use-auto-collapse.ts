"use client";

import { useEffect, useRef, useState } from "react";

export function useAutoCollapse(autoCollapse: boolean, initialOpen = true) {
  const [open, setOpen] = useState(initialOpen);
  const wasCollapsed = useRef(false);

  useEffect(() => {
    if (autoCollapse && !wasCollapsed.current) {
      setOpen(false);
      wasCollapsed.current = true;
    }
  }, [autoCollapse]);

  return { open, setOpen };
}
