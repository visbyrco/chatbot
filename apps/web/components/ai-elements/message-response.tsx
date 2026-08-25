"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import {
  StreamdownRenderer,
  type StreamdownRendererProps,
} from "./streamdown-renderer";

export type MessageResponseProps = StreamdownRendererProps;

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <StreamdownRenderer
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

MessageResponse.displayName = "MessageResponse";
