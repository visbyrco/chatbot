import type { Metadata } from "next";
import Link from "next/link";
import { getCanonicalUrl } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: {
    canonical: getCanonicalUrl("/terms"),
  },
  description: "The terms that govern your use of Visbyr Chat.",
  title: "Terms of Service",
};

export default function TermsOfServicePage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>
        <strong>Last updated:</strong> August 10, 2026
      </p>
      <p>
        Please also review our <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>1. Acceptance and Operator</h2>
      <p>
        By creating an account or using Visbyr Chat, you agree to these Terms of
        Service. Visbyr Chat is operated by VilhelmGain. If you do not agree
        with these Terms, do not use the service.
      </p>

      <h2>2. Eligibility and Accounts</h2>
      <p>
        You must be at least 16 years old or the applicable age of consent in
        your jurisdiction to use Visbyr Chat. You are responsible for keeping
        your account information accurate, protecting your credentials, and
        notifying us promptly if you believe your account has been compromised.
      </p>

      <h2>3. Services</h2>
      <p>
        Visbyr Chat provides multi-provider AI chat, documents, artifacts,
        exports, and support for bring-your-own-key providers. The service
        stores your conversations and related content so you can review, resume,
        export, and manage them.
      </p>

      <h2>4. Bring-Your-Own-Key Providers</h2>
      <p>
        You are responsible for the provider keys, accounts, and endpoints you
        configure. You must comply with each provider's terms and usage limits.
        When you use a custom provider, your prompts, context, and attachments
        are sent to that provider. Custom provider keys are encrypted, but the
        provider's own policies and availability are outside our control.
      </p>

      <h2>5. User Content</h2>
      <p>
        You retain ownership of the content you submit. You grant Visbyr Chat a
        limited license to store, process, transmit, and display that content as
        needed to provide the service. You are responsible for the content you
        submit and for making sure it does not violate these Terms or the law.
      </p>

      <h2>6. Acceptable Use</h2>
      <ul>
        <li>
          Do not submit unlawful, harmful, infringing, or abusive content.
        </li>
        <li>Do not interfere with, disrupt, or overload the service.</li>
        <li>Do not scrape, probe, or attempt unauthorized access.</li>
        <li>Do not impersonate others or misuse another person's account.</li>
        <li>
          Do not use the service to violate applicable laws or regulations.
        </li>
      </ul>

      <h2>7. AI Output</h2>
      <p>
        AI-generated output can be inaccurate, incomplete, or unsuitable for
        your situation. Visbyr Chat output is not professional advice, and you
        are responsible for reviewing and verifying anything you rely on.
      </p>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate access for violations of these Terms or
        misuse of the service. You can stop using the service at any time,
        delete your chats, and contact us to request account deletion.
      </p>

      <h2>9. Third-Party Services</h2>
      <p>
        Visbyr Chat relies on Clerk for authentication and on third-party AI
        providers for model responses. Those services have their own terms and
        privacy practices, and your use of them is subject to their policies.
      </p>

      <h2>10. Intellectual Property</h2>
      <p>
        The application source code is made available under the license included
        with the project. These Terms do not transfer ownership of Visbyr Chat,
        Visbyr, or VilhelmGain branding or trademarks.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        To the maximum extent permitted by law, Visbyr Chat is provided "as is"
        without warranties of any kind, including availability, accuracy,
        reliability, or fitness for a particular purpose.
      </p>

      <h2>12. Limitation of Liability and Indemnification</h2>
      <p>
        To the maximum extent permitted by law, Visbyr and VilhelmGain are not
        liable for indirect, incidental, special, consequential, or punitive
        damages arising from your use of the service. Nothing in these Terms
        limits rights that cannot be limited under mandatory consumer law. You
        agree to indemnify Visbyr and VilhelmGain from claims arising from your
        content, provider keys, or misuse of the service, to the extent
        permitted by law.
      </p>

      <h2>13. Changes</h2>
      <p>
        We may update these Terms from time to time. The effective date at the
        top of this page reflects the latest revision, and continued use of the
        service after changes means you accept the updated Terms.
      </p>

      <h2>14. General Terms</h2>
      <p>
        If any provision of these Terms is found invalid, the remaining
        provisions continue in effect. Our failure to enforce a provision is not
        a waiver. Questions about these Terms can be sent to{" "}
        <a href="mailto:support@visbyr.com">support@visbyr.com</a>.
      </p>
    </>
  );
}
