"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";

import { normalizeLatexDelimiters } from "@/lib/latex";

import "katex/dist/katex.min.css";

const math = createMathPlugin({ singleDollarTextMath: true });

const streamdownPlugins = { cjk, code, math, mermaid };

export type StreamdownRendererProps = ComponentProps<typeof Streamdown>;

export function StreamdownRenderer({
  className,
  children,
  ...props
}: StreamdownRendererProps) {
  return (
    <Streamdown className={className} plugins={streamdownPlugins} {...props}>
      {typeof children === "string"
        ? normalizeLatexDelimiters(children)
        : children}
    </Streamdown>
  );
}
