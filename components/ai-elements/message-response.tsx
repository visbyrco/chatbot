"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import {
  StreamdownRenderer,
  type StreamdownRendererProps,
} from "./streamdown-renderer";

export type MessageResponseProps = StreamdownRendererProps & {
  isStreaming?: boolean;
};

export const MessageResponse = memo(
  ({ className, isStreaming, ...props }: MessageResponseProps) => (
    <StreamdownRenderer
      caret="block"
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      isAnimating={isStreaming ?? false}
      mode={isStreaming ? "streaming" : "static"}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.className === nextProps.className
);

MessageResponse.displayName = "MessageResponse";
