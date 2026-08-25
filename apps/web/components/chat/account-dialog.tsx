"use client";

import { UserProfile } from "@clerk/nextjs";
import { Component, type ReactNode, useEffect } from "react";
import type { User } from "@/app/(auth)/auth";
import { UserAvatar } from "@/components/chat/user-avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

class ClerkProfileErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[AccountDialog] Clerk UserProfile failed", error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex w-[40rem] max-w-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-medium">Account failed to load</p>
          <p className="text-sm text-muted-foreground">
            Clerk could not load. Check your connection or try again.
          </p>
          <button
            className="text-sm underline underline-offset-4"
            onClick={this.handleRetry}
            type="button"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const PROFILE_APPEARANCE = {
  elements: {
    card: "h-full w-full",
    cardBox:
      "w-[40rem] max-w-full h-[min(45rem,80vh)] max-h-full rounded-none border-0 shadow-none",
    rootBox: "w-fit h-fit max-w-full",
  },
};

export function AccountDialog({
  testEnvironment,
  user,
  open,
  onOpenChange,
}: {
  testEnvironment: boolean;
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    if (open) {
      return;
    }
    if (window.location.hash.startsWith("#/")) {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="h-fit w-fit max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)]! gap-0 overflow-hidden rounded-lg! p-0"
        data-testid="account-dialog"
        showCloseButton
      >
        <DialogTitle className="sr-only">Account</DialogTitle>
        {testEnvironment ? (
          <TestAccountPanel user={user} />
        ) : (
          <ClerkProfileErrorBoundary>
            <UserProfile
              appearance={PROFILE_APPEARANCE}
              fallback={
                <div className="flex size-full min-h-[30rem] items-center justify-center text-sm text-muted-foreground">
                  Loading account&hellip;
                </div>
              }
              key={open ? "open" : "closed"}
              routing="hash"
            />
          </ClerkProfileErrorBoundary>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TestAccountPanel({ user }: { user: User }) {
  return (
    <div
      className="fade-up flex h-full w-[24rem] max-w-full flex-col items-center justify-center gap-4 p-6 text-center"
      data-testid="account-dialog-fallback"
    >
      <UserAvatar
        className="size-16"
        email={user.email ?? ""}
        src={user.image}
      />
      <div className="flex flex-col gap-1">
        {user.name ? <p className="font-medium">{user.name}</p> : null}
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Account management is not available in test mode.
      </p>
    </div>
  );
}
