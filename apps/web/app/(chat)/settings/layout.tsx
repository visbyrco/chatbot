import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    follow: true,
    index: false,
  },
  title: "Settings",
};

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
