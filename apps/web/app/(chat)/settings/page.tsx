"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { SettingsDialog } from "@/components/settings/settings-dialog";

export default function SettingsPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        router.replace("/");
      }
    },
    [router]
  );

  return <SettingsDialog onOpenChange={handleOpenChange} open={open} />;
}
