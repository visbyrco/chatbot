"use client";

import { useEffect, useRef, useState } from "react";

export type VisualViewportState = {
  height: number;
  offsetTop: number;
} | null;

export function useVisualViewport(): VisualViewportState {
  const [viewport, setViewport] = useState<VisualViewportState>(null);
  const lastViewportRef = useRef<VisualViewportState>(null);

  useEffect(() => {
    let frameId: number | null = null;

    const update = () => {
      if (frameId !== null) {
        return;
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;
        const { visualViewport } = window;
        const { height, offsetTop } = visualViewport ?? {
          height: window.innerHeight,
          offsetTop: 0,
        };
        const next = { height, offsetTop };

        const previous = lastViewportRef.current;
        if (
          previous?.height !== next.height ||
          previous?.offsetTop !== next.offsetTop
        ) {
          lastViewportRef.current = next;
          setViewport(next);
        }
        document.documentElement.style.setProperty(
          "--visual-viewport-height",
          `${height}px`
        );
        document.documentElement.style.setProperty(
          "--visual-viewport-offset",
          `${offsetTop}px`
        );
      });
    };

    update();

    const { visualViewport } = window;
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      document.documentElement.style.removeProperty("--visual-viewport-height");
      document.documentElement.style.removeProperty("--visual-viewport-offset");
    };
  }, []);

  return viewport;
}
