"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { useReducedMotion } from "framer-motion";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import { Streamdown } from "streamdown";

import { normalizeLatexDelimiters } from "@/lib/latex";

import "katex/dist/katex.min.css";
import "streamdown/styles.css";

const math = createMathPlugin({ singleDollarTextMath: true });

const streamdownPlugins = { cjk, code, math, mermaid };

// Phrase-level reveal: new words fade in with a short stagger instead of
// popping in raw token by token. Kept subtle on purpose.
const streamAnimation = {
  animation: "fadeIn",
  duration: 150,
  easing: "ease",
  sep: "word",
  stagger: 30,
} as const;

export type StreamdownRendererProps = ComponentProps<typeof Streamdown>;

export function StreamdownRenderer({
  className,
  children,
  animated,
  isAnimating,
  mode,
  ...props
}: StreamdownRendererProps) {
  const reduceMotion = useReducedMotion();

  const resolvedAnimated = useMemo(() => {
    if (animated !== undefined) {
      return animated;
    }
    if (reduceMotion) {
      return false;
    }
    return streamAnimation;
  }, [animated, reduceMotion]);

  // The LaTeX pass costs three full-string regexes per render. Plain prose
  // without a backslash is unchanged by it, so skip it on that fast path.
  const content =
    typeof children === "string" && children.includes("\\")
      ? normalizeLatexDelimiters(children)
      : children;

  return (
    <Streamdown
      animated={resolvedAnimated}
      className={className}
      isAnimating={isAnimating}
      mode={mode}
      plugins={streamdownPlugins}
      {...props}
    >
      {content}
    </Streamdown>
  );
}
