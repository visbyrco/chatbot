"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

export function emailToHue(email: string): number {
  let hash = 0;
  for (const char of email) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function UserAvatar({
  className,
  email,
  src,
}: {
  className?: string;
  email: string;
  src?: string | null;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const handleImageError = useCallback(() => {
    if (src) {
      setFailedSrc(src);
    }
  }, [src]);

  const isFailed = Boolean(src && failedSrc === src);

  if (!src || isFailed) {
    return (
      <div
        className={cn(
          "size-5 shrink-0 rounded-full ring-1 ring-sidebar-border/50",
          className
        )}
        data-testid="user-avatar"
        style={{
          background: `linear-gradient(135deg, oklch(0.35 0.08 ${emailToHue(email)}), oklch(0.25 0.05 ${emailToHue(email) + 40}))`,
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative size-5 shrink-0 overflow-hidden rounded-full ring-1 ring-sidebar-border/50",
        className
      )}
      data-testid="user-avatar"
    >
      <Image
        alt=""
        className="size-full object-cover"
        fill
        onError={handleImageError}
        sizes="20px"
        src={src}
        unoptimized
      />
    </div>
  );
}
