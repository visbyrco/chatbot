"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PanelLeftIcon } from "lucide-react"
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion"
import { createPortal } from "react-dom"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function SidebarProvider({
  defaultOpen = true,
  cookieName = SIDEBAR_COOKIE_NAME,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  cookieName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      document.cookie = `${cookieName}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [cookieName, setOpenProp, open]
  )

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full bg-transparent",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

const MOBILE_SIDEBAR_PARTIAL_RATIO = 0.7

function MobileSidebarSheet({
  open,
  onDismiss,
  children,
  label = "Chat threads",
}: {
  open: boolean
  onDismiss: () => void
  children: React.ReactNode
  label?: string
}) {
  const [expanded, setExpanded] = React.useState(false)
  const expandedRef = React.useRef(false)
  const [mounted, setMounted] = React.useState(false)
  const sheetHeight = useMotionValue(0)
  const prefersReducedMotion = useReducedMotion()
  const viewportHeight = React.useRef(0)
  const dragStartHeight = React.useRef(0)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!open) {
      sheetHeight.set(0)
      return
    }

    expandedRef.current = false
    setExpanded(false)
    viewportHeight.current =
      window.visualViewport?.height ?? window.innerHeight
    const partialHeight = Math.round(
      viewportHeight.current * MOBILE_SIDEBAR_PARTIAL_RATIO
    )
    if (prefersReducedMotion) {
      sheetHeight.set(partialHeight)
    } else {
      animate(sheetHeight, partialHeight, {
        type: "spring",
        stiffness: 340,
        damping: 42,
      })
    }

    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [open, prefersReducedMotion, sheetHeight])

  const snapTo = React.useCallback(
    (target: number) => {
      if (prefersReducedMotion) {
        sheetHeight.set(target)
      } else {
        animate(sheetHeight, target, {
          type: "spring",
          stiffness: 360,
          damping: 44,
        })
      }
    },
    [prefersReducedMotion, sheetHeight]
  )

  const requestDismiss = React.useCallback(() => {
    if (prefersReducedMotion) {
      sheetHeight.set(0)
      onDismiss()
    } else {
      animate(sheetHeight, 0, {
        duration: 0.18,
        ease: "easeIn",
        onComplete: onDismiss,
      })
    }
  }, [onDismiss, prefersReducedMotion, sheetHeight])

  React.useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return
      }

      const otherDialogOpen = document.querySelector(
        '[data-slot="dialog-content"][data-state="open"], [data-slot="alert-dialog-content"][data-state="open"]'
      )
      if (otherDialogOpen) {
        return
      }

      event.stopPropagation()
      requestDismiss()
    }

    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [open, requestDismiss])

  if (!mounted || !open) {
    return null
  }

  const viewportHeightPx = viewportHeight.current
  const partialHeight = Math.round(
    viewportHeightPx * MOBILE_SIDEBAR_PARTIAL_RATIO
  )

  return createPortal(
    <div className="fixed inset-0 z-50">
      <motion.div
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm supports-[backdrop-filter]:backdrop-blur-sm supports-[-webkit-backdrop-filter]:backdrop-blur-sm"
        initial={{ opacity: 0 }}
        onClick={requestDismiss}
        transition={{ duration: 0.25 }}
      />
      <motion.div
        animate={{ opacity: 1 }}
        aria-label={label}
        aria-modal="true"
        className={cn(
          "!absolute inset-x-0 bottom-0 flex flex-col overflow-hidden text-sidebar-foreground glass-floating",
          expanded ? "rounded-t-none" : "rounded-t-xl border-t border-border"
        )}
        data-mobile="true"
        data-sidebar="sidebar"
        initial={{ opacity: 0 }}
        role="dialog"
        style={{ height: sheetHeight }}
        transition={{ opacity: { duration: 0.25 } }}
      >
        <motion.div
          animate={{ opacity: 1 }}
          className="flex shrink-0 touch-none cursor-grab items-center justify-center py-2.5 active:cursor-grabbing"
          initial={{ opacity: 0 }}
          onPanStart={() => {
            dragStartHeight.current = sheetHeight.get()
          }}
          onPan={(_, info) => {
            const next = Math.min(
              Math.max(dragStartHeight.current - info.offset.y, 0),
              viewportHeightPx
            )
            sheetHeight.set(next)
          }}
          onPanEnd={(_, info) => {
            const delta = sheetHeight.get() - dragStartHeight.current
            const velocity = info.velocity.y

            if (expandedRef.current) {
              if (delta < -viewportHeightPx * 0.3 || velocity > 900) {
                requestDismiss()
              } else if (delta < -viewportHeightPx * 0.12 || velocity > 550) {
                expandedRef.current = false
                setExpanded(false)
                snapTo(partialHeight)
              } else {
                snapTo(viewportHeightPx)
              }
            } else if (delta > viewportHeightPx * 0.2 || velocity < -700) {
              expandedRef.current = true
              setExpanded(true)
              snapTo(viewportHeightPx)
            } else if (delta < -viewportHeightPx * 0.2 || velocity > 700) {
              requestDismiss()
            } else {
              snapTo(partialHeight)
            }
          }}
          onTap={() => {
            if (expandedRef.current) {
              expandedRef.current = false
              setExpanded(false)
              snapTo(partialHeight)
            } else {
              expandedRef.current = true
              setExpanded(true)
              snapTo(viewportHeightPx)
            }
          }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            animate={{ scaleX: 1 }}
            className="h-1.5 w-12 rounded-full bg-sidebar-foreground/20"
            initial={{ scaleX: 0.5 }}
            transition={{ delay: 0.08, duration: 0.25 }}
          />
        </motion.div>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="flex min-h-0 flex-1 w-full flex-col overflow-x-hidden overflow-y-auto pt-1 pb-2"
          initial={{ opacity: 0, y: 16 }}
          transition={{ delay: 0.05, duration: 0.3 }}
        >
          {children}
        </motion.div>
      </motion.div>
    </div>,
    document.body
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  mobileSheetLabel,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
  mobileSheetLabel?: string
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col glass-surface-static text-sidebar-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <MobileSidebarSheet
        label={mobileSheetLabel}
        onDismiss={() => setOpenMobile(false)}
        open={openMobile}
      >
        {children}
      </MobileSidebarSheet>
    )
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-smooth",
          "group-data-[collapsible=offcanvas]:w-0",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) overflow-hidden transition-[left,right,width] duration-200 ease-smooth data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex",
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full min-w-0 max-w-full flex-col overflow-hidden glass-surface-static group-data-[variant=floating]:rounded-xl group-data-[variant=floating]:border-none group-data-[variant=floating]:shadow-[var(--shadow-float)]"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar, open } = useSidebar()

  return (
    <Button
      aria-expanded={open}
      aria-label="Toggle Sidebar"
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn("rounded-lg", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar, state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <div
      data-slot="sidebar-rail"
      className={cn(
        "group/rail absolute inset-y-0 z-20 hidden w-4 overflow-visible group-data-[side=left]:-right-4 sm:block",
        className
      )}
    >
      <button
        data-sidebar="rail"
        aria-label="Toggle Sidebar"
        tabIndex={-1}
        onClick={toggleSidebar}
        className="absolute inset-y-0 left-0 w-4 cursor-w-resize [[data-side=left][data-state=collapsed]_&]:cursor-e-resize"
        {...props}
      />
      <div className={cn(
        "pointer-events-none absolute bottom-0 left-0 w-0 border-l border-border opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100",
        "top-0"
      )} />
    </div>
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full flex-1 flex-col bg-transparent [transform:translate3d(0,0,0)]",
        className
      )}
      {...props}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("h-8 w-full rounded-lg bg-foreground/4 shadow-none", className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn(
        "flex flex-col gap-2 p-2 [--radius:var(--radius-xl)]",
        className
      )}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 w-auto", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto supports-[scrollbar-gutter:stable]:[scrollbar-gutter:stable] [--radius:var(--radius-xl)] group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "flex h-8 shrink-0 items-center rounded-lg px-2 font-manrope text-[10px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/60 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus:outline-none focus-visible:outline-none [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-foreground/10 hover:text-sidebar-foreground focus:outline-none focus-visible:outline-none md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
        "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-lg px-3 text-left text-[13px] text-sidebar-foreground/70 outline-hidden transition-all duration-150 group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:text-sidebar-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:text-sidebar-accent-foreground data-active:font-semibold data-active:text-sidebar-primary data-active:bg-sidebar-primary/10 data-active:glow-primary [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "hover:bg-foreground/5 hover:text-sidebar-foreground",
        outline:
          "border border-border bg-foreground/4 hover:border-primary/30 hover:bg-primary/5 hover:text-sidebar-foreground hover:glow-primary",
      },
      size: {
        default: "h-9 text-[13px]",
        sm: "h-8 text-xs",
        lg: "h-14 px-4 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot.Root : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive || undefined}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  showOnHover?: boolean
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground/40 outline-hidden transition-colors duration-150 group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-foreground/60 peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-3 md:after:-inset-2 hover:bg-foreground/10 hover:text-sidebar-foreground md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-primary aria-expanded:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-sidebar-primary",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean
}) {
  const [width] = React.useState(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  })

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
  size?: "sm" | "md"
  isActive?: boolean
}) {
  const Comp = asChild ? Slot.Root : "a"

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-lg px-3 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-foreground/5 hover:text-sidebar-foreground focus:outline-none focus-visible:outline-none active:bg-foreground/5 active:text-sidebar-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-primary/10 data-active:text-sidebar-primary data-active:glow-primary [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-primary",
        className
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
