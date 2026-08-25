import { ArrowRight, FileText, Mail, Scale } from "lucide-react";
import Link from "next/link";
import { LEGAL_DOCUMENTS, SUPPORT_EMAIL } from "@/lib/legal";

export function LegalPanel() {
  return (
    <div className="flex flex-col gap-4" data-testid="legal-panel">
      <div className="flex flex-col gap-5 rounded-lg border border-border glass-surface p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/5">
            <Scale className="size-3.5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium">Legal documents</h3>
            <p className="text-xs text-muted-foreground">
              Current privacy and usage terms for Visbyr Chat.
            </p>
          </div>
        </div>
        <div className="divide-y divide-border/60 border-t border-border">
          {LEGAL_DOCUMENTS.map((document) => (
            <Link
              className="group flex items-center justify-between gap-4 py-3.5 text-sm transition-colors duration-150 hover:text-foreground"
              href={document.href}
              key={document.href}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2 font-medium">
                  <FileText className="size-3.5 text-muted-foreground" />
                  {document.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {document.description}
                </span>
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border glass-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/5">
            <Mail className="size-3.5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium">Support</h3>
            <p className="text-xs text-muted-foreground">
              Questions about your data or these terms.
            </p>
          </div>
        </div>
        <Link
          className="text-sm font-medium text-foreground hover:underline"
          href={`mailto:${SUPPORT_EMAIL}`}
        >
          {SUPPORT_EMAIL}
        </Link>
      </div>
    </div>
  );
}
