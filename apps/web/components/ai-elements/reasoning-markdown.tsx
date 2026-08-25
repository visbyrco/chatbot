"use client";

import type { ComponentProps } from "react";
import { StreamdownRenderer } from "./streamdown-renderer";

export type ReasoningMarkdownProps = ComponentProps<typeof StreamdownRenderer>;

export function ReasoningMarkdown({
  className,
  ...props
}: ReasoningMarkdownProps) {
  return <StreamdownRenderer className={className} {...props} />;
}
