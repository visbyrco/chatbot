// biome-ignore-all lint/performance/noImgElement: preview needs plain img for blob/data URLs
import type { Attachment } from "@/lib/types";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Spinner } from "../ui/spinner";
import { CrossSmallIcon, MoreHorizontalIcon } from "./icons";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  // HEIC/HEIF are not decodable in Chromium/Firefox (Safari-only). Treat them
  // as non-previewable so the UI shows a generic file tile instead of a broken
  // <img>. AVIF is previewable in modern Chrome/Firefox and stays in the image branch.
  const isHeicHeif =
    contentType === "image/heic" ||
    contentType === "image/heif" ||
    contentType === "image/heic-sequence" ||
    contentType === "image/heif-sequence";
  const isPreviewableImage = !!contentType?.startsWith("image") && !isHeicHeif;

  // Legacy messages persist absolute `http(s)://<host>/api/files/...` URLs that
  // may not match the current origin. Rewrite them to a same-origin path so the
  // preview loads regardless of host/port and never trips `next/image`
  // remotePatterns validation. Relative and `data:` URLs pass through.
  const src = (() => {
    try {
      const parsed = new URL(url, "http://local.invalid");
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      if (parsed.pathname.startsWith("/api/files/")) {
        return parsed.pathname;
      }
      if (basePath && parsed.pathname.startsWith(`${basePath}/api/files/`)) {
        return parsed.pathname;
      }
    } catch {
      /* not an absolute URL */
    }
    return url;
  })();

  return (
    <div
      className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-foreground/4"
      data-testid="input-attachment-preview"
    >
      {isPreviewableImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- preview needs raw src
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: img onError handles decode failure
        <img
          alt={name ?? "attachment"}
          className="size-full object-cover"
          height={96}
          // biome-ignore lint/performance/noJsxPropsBind: preview fallback needs inline handler to hide broken image
          onError={(e) => {
            // Fallback to file tile on decode failure (e.g. corrupt image or
            // unsupported codec). Hide the broken image element.
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
          src={src}
          width={96}
        />
      ) : isHeicHeif ? (
        <div className="flex size-full flex-col items-center justify-center gap-1 bg-foreground/5 px-2 text-center">
          <span className="text-[10px] font-medium text-muted-foreground">
            HEIC
          </span>
          <span className="max-w-full truncate text-[10px] text-muted-foreground">
            {name}
          </span>
        </div>
      ) : contentType?.startsWith("video") ? (
        <video
          className="size-full object-cover"
          controls
          muted
          playsInline
          preload="metadata"
          src={src}
        />
      ) : contentType?.startsWith("audio") ? (
        // biome-ignore lint/a11y/useMediaCaption: preview has no captions
        <audio
          aria-label={name}
          className="w-full self-center px-2"
          controls
          preload="metadata"
          src={src}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 bg-foreground/5 px-2 text-center">
          <span className="text-[10px] font-medium text-muted-foreground">
            File
          </span>
          <span className="max-w-full truncate text-[10px] text-muted-foreground">
            {name}
          </span>
        </div>
      )}

      {isUploading ? (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 backdrop-blur-sm"
          data-testid="input-attachment-loader"
        >
          <Spinner className="size-5" />
        </div>
      ) : null}

      {onRemove && !isUploading && (
        <>
          <button
            aria-label="Remove attachment"
            className="absolute top-1.5 right-1.5 hidden size-5 items-center justify-center rounded-md bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100 md:flex"
            onClick={onRemove}
            type="button"
          >
            <CrossSmallIcon size={10} />
          </button>

          <div className="absolute top-1.5 right-1.5 md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Attachment options"
                  className="relative size-8 text-white after:absolute after:-inset-[6px] md:after:hidden"
                  data-testid="attachment-options"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="cursor-pointer"
                  data-testid="attachment-remove"
                  onClick={onRemove}
                  variant="destructive"
                >
                  <span>Remove attachment</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}
    </div>
  );
};
