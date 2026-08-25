import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 min-w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:outline-none has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3! hover:-translate-y-px",
  {
    variants: {
      variant: {
        default:
          "border-primary/30 bg-primary/10 text-primary [a]:hover:bg-primary/20 [a]:hover:border-primary/50",
        secondary:
          "border-secondary/30 bg-secondary/15 text-secondary-foreground [a]:hover:bg-secondary/25 [a]:hover:border-secondary/50",
        destructive:
          "border-error/30 bg-error/10 text-error [a]:hover:bg-error/20",
        outline:
          "border-border bg-foreground/5 text-foreground [a]:hover:bg-foreground/10",
        ghost: "hover:bg-foreground/5 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
