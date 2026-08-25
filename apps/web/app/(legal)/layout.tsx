import { Mail, MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { LEGAL_DOCUMENTS, SUPPORT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  robots: {
    follow: true,
    index: true,
  },
};

export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border/70 bg-card/40">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <Link
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
            href="/"
          >
            <MessageSquare className="size-4 text-muted-foreground" />
            Visbyr Chat
          </Link>
          <nav aria-label="Legal documents" className="flex items-center gap-1">
            {LEGAL_DOCUMENTS.map((document) => (
              <Link
                className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                href={document.href}
                key={document.href}
              >
                {document.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <LegalDocument>{children}</LegalDocument>
      <footer className="border-t border-border/70 bg-card/40">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-5 text-[13px] text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <p>&copy; 2026 Visbyr Chat</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              className="hover:text-foreground"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              <Mail className="mr-1.5 inline size-3.5" />
              {SUPPORT_EMAIL}
            </Link>
            {LEGAL_DOCUMENTS.map((document) => (
              <Link
                className="hover:text-foreground"
                href={document.href}
                key={document.href}
              >
                {document.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
