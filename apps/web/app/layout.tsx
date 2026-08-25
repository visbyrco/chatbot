import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { Suspense } from "react";
import { ChunkErrorHandler } from "@/components/chunk-error-handler";
import { NonceScripts } from "@/components/nonce-scripts";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usesMockAuthNow } from "@/lib/constants";
import { getCanonicalUrl, getMetadataBase } from "@/lib/seo";

// Computed key on purpose: a dotted `process.env.NEXT_PUBLIC_*` read is
// inlined at build time, which breaks images built without the var. A
// variable-keyed lookup survives to runtime so the key is read at server start.
const CLERK_PUBLISHABLE_KEY = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY";

function getClerkPublishableKey(): string | undefined {
  return process.env[CLERK_PUBLISHABLE_KEY];
}

import "./globals.css";

export const metadata: Metadata = {
  alternates: {
    canonical: getCanonicalUrl("/"),
  },
  applicationName: "Visbyr Chat",
  description:
    "Visbyr Chat is a bring-your-own-key AI chat app for custom OpenAI-compatible and Anthropic-compatible providers.",
  metadataBase: getMetadataBase(),
  openGraph: {
    description:
      "Visbyr Chat is a bring-your-own-key AI chat app for custom OpenAI-compatible and Anthropic-compatible providers.",
    locale: "en_US",
    siteName: "Visbyr Chat",
    title: "Visbyr Chat",
    type: "website",
    url: getCanonicalUrl("/"),
  },
  title: {
    default: "Visbyr Chat",
    template: "%s | Visbyr Chat",
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Visbyr Chat is a bring-your-own-key AI chat app for custom OpenAI-compatible and Anthropic-compatible providers.",
    title: "Visbyr Chat",
  },
};

export const viewport: Viewport = {
  initialScale: 1,
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  width: "device-width",
};

const sora = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/sora.woff2",
  variable: "--font-sora",
  weight: "400 700",
});

const montserrat = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/montserrat.woff2",
  variable: "--font-montserrat",
  weight: "400 700",
});

const manrope = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/manrope.woff2",
  variable: "--font-manrope",
  weight: "400 700",
});

const geistMono = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  weight: "400 700",
});

const inter = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/inter.woff2",
  variable: "--font-inter",
  weight: "400 700",
});

const geist = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/geist.woff2",
  variable: "--font-geist",
  weight: "400 700",
});

const spaceGrotesk = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/space-grotesk.woff2",
  variable: "--font-space-grotesk",
  weight: "400 700",
});

const dmSans = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/dm-sans.woff2",
  variable: "--font-dm-sans",
  weight: "400 700",
});

const interTight = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/inter-tight.woff2",
  variable: "--font-inter-tight",
  weight: "400 700",
});

const roboto = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/roboto.woff2",
  variable: "--font-roboto",
  weight: "400 700",
});

const jetbrainsMono = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/jetbrains-mono.woff2",
  variable: "--font-jetbrains-mono",
  weight: "400 700",
});

const firaCode = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/fira-code.woff2",
  variable: "--font-fira-code",
  weight: "400 700",
});

const ibmPlexMono = localFont({
  display: "swap",
  preload: false,
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500" },
    { path: "./fonts/ibm-plex-mono-600.woff2", weight: "600" },
    { path: "./fonts/ibm-plex-mono-700.woff2", weight: "700" },
  ],
  variable: "--font-ibm-plex-mono",
});

const spaceMono = localFont({
  display: "swap",
  preload: false,
  src: [
    { path: "./fonts/space-mono-400.woff2", weight: "400" },
    { path: "./fonts/space-mono-700.woff2", weight: "700" },
  ],
  variable: "--font-space-mono",
});

const robotoMono = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/roboto-mono.woff2",
  variable: "--font-roboto-mono",
  weight: "400 700",
});

const cascadiaCode = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/cascadia-code.woff2",
  variable: "--font-cascadia-code",
  weight: "400 700",
});

const stixTwoMath = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/stix-two-math-regular.woff2",
  variable: "--font-stix-two-math",
  weight: "400",
});

const notoSansMath = localFont({
  display: "swap",
  preload: false,
  src: "./fonts/noto-sans-math.woff2",
  variable: "--font-noto-sans-math",
  weight: "400",
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      className={`${sora.variable} ${montserrat.variable} ${manrope.variable} ${geistMono.variable} ${inter.variable} ${geist.variable} ${spaceGrotesk.variable} ${dmSans.variable} ${interTight.variable} ${roboto.variable} ${jetbrainsMono.variable} ${firaCode.variable} ${ibmPlexMono.variable} ${spaceMono.variable} ${robotoMono.variable} ${cascadiaCode.variable} ${stixTwoMath.variable} ${notoSansMath.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <Suspense fallback={null}>
          <NonceScripts />
        </Suspense>
      </head>
      <body className="antialiased">
        <ChunkErrorHandler />
        <div aria-hidden className="bg-aurora" />
        <div aria-hidden className="bg-noise" />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          {usesMockAuthNow() ? (
            <TooltipProvider>{children}</TooltipProvider>
          ) : (
            <ClerkProvider
              nonce={nonce}
              publishableKey={getClerkPublishableKey()}
            >
              <TooltipProvider>{children}</TooltipProvider>
            </ClerkProvider>
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
