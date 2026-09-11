// biome-ignore-all lint/performance/noImgElement lint/performance/noJsxPropsBind lint/a11y/noNoninteractiveElementInteractions: stable handlers and external logo fallback
import type { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ModelSelectorProps = React.ComponentProps<
  typeof PopoverPrimitive.Root
>;

export const ModelSelector = (props: ModelSelectorProps) => (
  <Popover {...props} />
);

export type ModelSelectorTriggerProps = ComponentProps<typeof PopoverTrigger>;

export const ModelSelectorTrigger = (props: ModelSelectorTriggerProps) => (
  <PopoverTrigger {...props} />
);

export type ModelSelectorContentProps = ComponentProps<
  typeof PopoverContent
> & {
  commandDefaultValue?: ComponentProps<typeof Command>["defaultValue"];
  title?: ReactNode;
};

export const ModelSelectorContent = ({
  className,
  commandDefaultValue,
  children,
  title: _title,
  ...props
}: ModelSelectorContentProps) => (
  <PopoverContent
    align="start"
    className={cn(
      "w-[280px] p-0 rounded-lg overflow-hidden border border-border glass-surface backdrop-blur-xl shadow-[var(--shadow-float)]",
      className
    )}
    onWheel={(event) => event.stopPropagation()}
    side="top"
    sideOffset={8}
    {...props}
  >
    <Command
      className="**:data-[slot=command-input-wrapper]:h-auto"
      defaultValue={commandDefaultValue}
    >
      {children}
    </Command>
  </PopoverContent>
);

export type ModelSelectorInputProps = ComponentProps<typeof CommandInput>;

export const ModelSelectorInput = ({
  className,
  ...props
}: ModelSelectorInputProps) => (
  <CommandInput
    className={cn("h-auto py-2.5 text-[13px]", className)}
    {...props}
  />
);

export type ModelSelectorListProps = ComponentProps<typeof CommandList>;

export const ModelSelectorList = ({
  className,
  ...props
}: ModelSelectorListProps) => (
  <CommandList
    className={cn(
      "max-h-[min(280px,calc(var(--visual-viewport-height,100vh)-132px))]",
      className
    )}
    {...props}
  />
);

export type ModelSelectorEmptyProps = ComponentProps<typeof CommandEmpty>;

export const ModelSelectorEmpty = (props: ModelSelectorEmptyProps) => (
  <CommandEmpty {...props} />
);

export type ModelSelectorGroupProps = ComponentProps<typeof CommandGroup>;

export const ModelSelectorGroup = (props: ModelSelectorGroupProps) => (
  <CommandGroup {...props} />
);

export type ModelSelectorItemProps = ComponentProps<typeof CommandItem>;

export const ModelSelectorItem = ({
  className,
  ...props
}: ModelSelectorItemProps) => (
  <CommandItem className={cn("w-full text-[13px]", className)} {...props} />
);

export type ModelSelectorShortcutProps = ComponentProps<typeof CommandShortcut>;

export const ModelSelectorShortcut = (props: ModelSelectorShortcutProps) => (
  <CommandShortcut {...props} />
);

export type ModelSelectorSeparatorProps = ComponentProps<
  typeof CommandSeparator
>;

export const ModelSelectorSeparator = (props: ModelSelectorSeparatorProps) => (
  <CommandSeparator {...props} />
);

export type ModelSelectorLogoProps = Omit<
  ComponentProps<"img">,
  "src" | "alt"
> & {
  provider:
    | "moonshotai-cn"
    | "lucidquery"
    | "moonshotai"
    | "zai-coding-plan"
    | "alibaba"
    | "xai"
    | "vultr"
    | "nvidia"
    | "upstage"
    | "groq"
    | "github-copilot"
    | "mistral"
    | "vercel"
    | "nebius"
    | "deepseek"
    | "alibaba-cn"
    | "google-vertex-anthropic"
    | "venice"
    | "chutes"
    | "cortecs"
    | "github-models"
    | "togetherai"
    | "azure"
    | "baseten"
    | "huggingface"
    | "opencode"
    | "fastrouter"
    | "google"
    | "google-vertex"
    | "cloudflare-workers-ai"
    | "inception"
    | "wandb"
    | "openai"
    | "zhipuai-coding-plan"
    | "perplexity"
    | "openrouter"
    | "zenmux"
    | "v0"
    | "iflowcn"
    | "synthetic"
    | "deepinfra"
    | "zhipuai"
    | "submodel"
    | "zai"
    | "inference"
    | "requesty"
    | "morph"
    | "lmstudio"
    | "anthropic"
    | "aihubmix"
    | "fireworks-ai"
    | "modelscope"
    | "llama"
    | "scaleway"
    | "amazon-bedrock"
    | "cerebras"
    // oxlint-disable-next-line typescript-eslint(ban-types) -- intentional pattern for autocomplete-friendly string union
    | (string & {});
};

export const ModelSelectorLogo = ({
  provider,
  className,
  ...props
}: ModelSelectorLogoProps) => {
  const fallback = (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-sm bg-foreground/10 text-[9px] font-semibold uppercase leading-none text-muted-foreground",
        className
      )}
    >
      {provider.slice(0, 2)}
    </span>
  );

  // Custom providers use a UUID-like key (e.g. "custom-xxxxx") that has no
  // logo on models.dev. Render the fallback immediately to avoid a 404/blank.
  if (provider.startsWith("custom-") || provider.startsWith("custom/")) {
    return fallback;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external logo, needs fallback handling
    <img
      {...props}
      alt={`${provider} logo`}
      className={cn("size-4 dark:invert", className)}
      height={16}
      onError={(event) => {
        const target = event.currentTarget;
        target.style.display = "none";
        const span = document.createElement("span");
        span.textContent = provider.slice(0, 2);
        span.className =
          "inline-flex size-4 shrink-0 items-center justify-center rounded-sm bg-foreground/10 text-[9px] font-semibold uppercase leading-none text-muted-foreground";
        if (className) {
          span.classList.add(...className.split(" ").filter(Boolean));
        }
        target.insertAdjacentElement("afterend", span);
      }}
      src={`https://models.dev/logos/${provider}.svg`}
      width={16}
    />
  );
};

export type ModelSelectorLogoGroupProps = ComponentProps<"div">;

export const ModelSelectorLogoGroup = ({
  className,
  ...props
}: ModelSelectorLogoGroupProps) => (
  <div
    className={cn(
      "flex shrink-0 items-center -space-x-1 [&>img]:rounded-md [&>img]:p-px [&>img]:ring-1 [&>img]:ring-border/30",
      className
    )}
    {...props}
  />
);

export type ModelSelectorNameProps = ComponentProps<"span">;

export const ModelSelectorName = ({
  className,
  ...props
}: ModelSelectorNameProps) => (
  <span className={cn("flex-1 truncate text-left", className)} {...props} />
);
