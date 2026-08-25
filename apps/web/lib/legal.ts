export const SUPPORT_EMAIL = "support@visbyr.com";

export const LEGAL_DOCUMENTS = [
  {
    description: "How Visbyr Chat handles personal information.",
    href: "/privacy",
    label: "Privacy Policy",
  },
  {
    description: "Rules for using Visbyr Chat.",
    href: "/terms",
    label: "Terms of Service",
  },
] as const;

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];
