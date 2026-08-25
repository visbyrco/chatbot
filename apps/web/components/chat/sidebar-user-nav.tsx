"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, Settings } from "lucide-react";
import { useCallback, useState } from "react";
import type { User } from "@/app/(auth)/auth";
import { signOut } from "@/app/(chat)/actions";
import { AccountDialog } from "@/components/chat/account-dialog";
import { UserAvatar } from "@/components/chat/user-avatar";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import {
  type IdentityDisplayMode,
  useIdentityDisplayMode,
} from "@/lib/identity-display";

function ClerkAvatar({ user, className }: { user: User; className?: string }) {
  const { isLoaded, user: clerkUser } = useUser();
  const src = isLoaded && clerkUser?.imageUrl ? clerkUser.imageUrl : user.image;
  return (
    <UserAvatar className={className} email={user.email ?? ""} src={src} />
  );
}

function IdentityLabel({
  mode,
  user,
}: {
  mode: IdentityDisplayMode;
  user: User;
}) {
  if (mode === "email") {
    return (
      <span className="truncate text-[13px]" data-testid="user-nav-label">
        {user.email}
      </span>
    );
  }
  if (mode === "name-email") {
    return (
      <div className="flex min-w-0 flex-col" data-testid="user-nav-label">
        <span className="truncate text-[13px]">{user.name ?? user.email}</span>
        {user.name ? (
          <span className="truncate text-[11px] text-sidebar-foreground/60">
            {user.email}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <span className="truncate text-[13px]" data-testid="user-nav-label">
      {user.name ?? user.email}
    </span>
  );
}

export function SidebarUserNav({
  testEnvironment,
  user,
}: {
  testEnvironment: boolean;
  user: User;
}) {
  if (testEnvironment) {
    return <MockSidebarUserNav user={user} />;
  }
  return <ClerkSidebarUserNav user={user} />;
}

function MockSidebarUserNav({ user }: { user: User }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const identityDisplayMode = useIdentityDisplayMode();

  const handleOpenAccount = useCallback(() => {
    setPopoverOpen(false);
    setShowAccount(true);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleSignOut = useCallback(() => {
    setPopoverOpen(false);
    // biome-ignore lint/complexity/noVoid: fire-and-forget server action
    void signOut();
  }, []);

  const displayName = user.name ?? user.email ?? "User";
  const displaySub = user.email ?? "";

  return (
    <>
      <Popover onOpenChange={setPopoverOpen} open={popoverOpen}>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-1 rounded-lg bg-transparent p-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:p-0">
              <PopoverTrigger asChild>
                <button
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:order-2 ${identityDisplayMode === "name-email" ? "h-10 group-data-[collapsible=icon]:h-8" : "h-8"}`}
                  data-testid="user-nav-button"
                  type="button"
                >
                  <UserAvatar
                    className="size-5 shrink-0 group-data-[collapsible=icon]:size-6"
                    email={user.email ?? ""}
                    src={user.image}
                  />
                  <span className="flex min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <IdentityLabel mode={identityDisplayMode} user={user} />
                  </span>
                </button>
              </PopoverTrigger>
              <button
                aria-label="Settings"
                className="grid size-8 shrink-0 place-items-center rounded-md text-sidebar-foreground/50 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:order-1"
                data-testid="user-nav-item-settings"
                onClick={handleOpenSettings}
                type="button"
              >
                <Settings className="size-4" />
              </button>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <PopoverContent
          align="start"
          className="w-[22rem] overflow-hidden rounded-2xl border border-white/10 bg-[#1e232e] p-0 shadow-2xl"
          data-testid="user-menu-popover"
          side="top"
          sideOffset={12}
        >
          <div className="flex items-center gap-3 px-4 py-4">
            <UserAvatar
              className="size-10 shrink-0"
              email={user.email ?? ""}
              src={user.image}
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium leading-none text-white">
                {displayName}
              </span>
              {displaySub ? (
                <span className="truncate text-xs leading-none text-white/60 mt-1">
                  {displaySub}
                </span>
              ) : null}
            </div>
          </div>
          <div className="h-px bg-white/10" />
          <button
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white/90 transition-colors hover:bg-white/[0.06]"
            data-testid="user-menu-manage-account"
            onClick={handleOpenAccount}
            type="button"
          >
            <Settings className="size-4 shrink-0 text-white/60" />
            Manage account
          </button>
          <div className="h-px bg-white/10" />
          <button
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white/90 transition-colors hover:bg-white/[0.06]"
            data-testid="user-menu-sign-out"
            onClick={handleSignOut}
            type="button"
          >
            <LogOut className="size-4 shrink-0 text-white/60" />
            Sign out
          </button>
          <div className="flex items-center justify-center gap-1.5 bg-[#181d27] px-4 py-3">
            <span className="text-xs text-white/50">Secured by</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold tracking-tight text-white">
              <span className="grid size-3 place-items-center rounded-full bg-white text-[8px] font-bold leading-none text-[#1e232e]">
                C
              </span>
              clerk
            </span>
          </div>
        </PopoverContent>
      </Popover>
      <AccountDialog
        onOpenChange={setShowAccount}
        open={showAccount}
        testEnvironment
        user={user}
      />
      <SettingsDialog onOpenChange={setShowSettings} open={showSettings} />
    </>
  );
}

function ClerkSidebarUserNav({ user }: { user: User }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const identityDisplayMode = useIdentityDisplayMode();
  const clerk = useClerk();

  const handleOpenAccount = useCallback(() => {
    setPopoverOpen(false);
    if (clerk.openUserProfile) {
      try {
        clerk.openUserProfile();
        return;
      } catch {
        // fallback to local dialog
      }
    }
    setShowAccount(true);
  }, [clerk]);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleSignOut = useCallback(async () => {
    setPopoverOpen(false);
    try {
      await clerk.signOut();
    } catch {
      // proceed to redirect even if signOut fails
    }
    window.location.href = "/";
  }, [clerk]);

  const displayName = user.name ?? user.email ?? "User";
  const displaySub = user.email ?? "";

  return (
    <>
      <Popover onOpenChange={setPopoverOpen} open={popoverOpen}>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-1 rounded-lg bg-transparent p-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:p-0">
              <PopoverTrigger asChild>
                <button
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:order-2 ${identityDisplayMode === "name-email" ? "h-10 group-data-[collapsible=icon]:h-8" : "h-8"}`}
                  data-testid="user-nav-button"
                  type="button"
                >
                  <ClerkAvatar
                    className="size-5 shrink-0 group-data-[collapsible=icon]:size-6"
                    user={user}
                  />
                  <span className="flex min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <IdentityLabel mode={identityDisplayMode} user={user} />
                  </span>
                </button>
              </PopoverTrigger>
              <button
                aria-label="Settings"
                className="grid size-8 shrink-0 place-items-center rounded-md text-sidebar-foreground/50 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:order-1"
                data-testid="user-nav-item-settings"
                onClick={handleOpenSettings}
                type="button"
              >
                <Settings className="size-4" />
              </button>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <PopoverContent
          align="start"
          className="w-[22rem] overflow-hidden rounded-2xl border border-white/10 bg-[#1e232e] p-0 shadow-2xl"
          data-testid="user-menu-popover"
          side="top"
          sideOffset={12}
        >
          <div className="flex items-center gap-3 px-4 py-4">
            <ClerkAvatar className="size-10 shrink-0" user={user} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium leading-none text-white">
                {displayName}
              </span>
              {displaySub ? (
                <span className="truncate text-xs leading-none text-white/60 mt-1">
                  {displaySub}
                </span>
              ) : null}
            </div>
          </div>
          <div className="h-px bg-white/10" />
          <button
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white/90 transition-colors hover:bg-white/[0.06]"
            data-testid="user-menu-manage-account"
            onClick={handleOpenAccount}
            type="button"
          >
            <Settings className="size-4 shrink-0 text-white/60" />
            Manage account
          </button>
          <div className="h-px bg-white/10" />
          <button
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white/90 transition-colors hover:bg-white/[0.06]"
            data-testid="user-menu-sign-out"
            onClick={handleSignOut}
            type="button"
          >
            <LogOut className="size-4 shrink-0 text-white/60" />
            Sign out
          </button>
          <div className="flex items-center justify-center gap-1.5 bg-[#181d27] px-4 py-3">
            <span className="text-xs text-white/50">Secured by</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold tracking-tight text-white">
              <span className="grid size-3 place-items-center rounded-full bg-white text-[8px] font-bold leading-none text-[#1e232e]">
                C
              </span>
              clerk
            </span>
          </div>
        </PopoverContent>
      </Popover>
      <AccountDialog
        onOpenChange={setShowAccount}
        open={showAccount}
        testEnvironment={false}
        user={user}
      />
      <SettingsDialog onOpenChange={setShowSettings} open={showSettings} />
    </>
  );
}
