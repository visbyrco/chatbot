import type { Metadata } from "next";
import Link from "next/link";
import { getCanonicalUrl } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: {
    canonical: getCanonicalUrl("/privacy"),
  },
  description: "How Visbyr Chat collects, uses, and protects your information.",
  title: "Privacy Policy",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>
        <strong>Last updated:</strong> August 10, 2026
      </p>
      <p>
        Please also review our <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2>1. Who We Are</h2>
      <p>
        Visbyr Chat is operated by VilhelmGain. If you have questions about this
        Privacy Policy, contact us at{" "}
        <a href="mailto:support@visbyr.com">support@visbyr.com</a>.
      </p>

      <h2>2. Information We Collect</h2>

      <h3>Account information</h3>
      <p>
        When you sign in, we receive from Clerk the account details needed to
        operate your account, including your name, email address, and profile
        image if you have one.
      </p>

      <h3>Conversations and artifacts</h3>
      <p>
        We store your chat titles, messages, documents, suggestions, and
        attachments so you can review, resume, export, and manage your work.
        This data is stored in our Postgres database.
      </p>

      <h3>Provider configuration</h3>
      <p>
        If you add a custom provider, we store the provider name and endpoint,
        and we encrypt your provider API key before saving it.
      </p>

      <h3>Technical data and cookies</h3>
      <p>
        We use cookies and local storage for Clerk authentication and for
        preferences such as theme, sidebar state, chat model, reasoning effort,
        and enabled tools. Your preferences are also stored on your account so
        they stay in sync across your devices. When Redis is enabled, we may
        keep short-lived records for rate limiting and stream resumption.
      </p>

      <h3>AI request data</h3>
      <p>
        When you send a message, we transmit the prompt, relevant context, and
        attachments to the AI provider or custom endpoint you selected. We may
        also send your first user message to the selected provider to generate a
        chat title.
      </p>

      <h2>3. How We Use Your Information</h2>
      <ul>
        <li>Operate Visbyr Chat and save your chat history.</li>
        <li>Generate chat titles, documents, suggestions, and artifacts.</li>
        <li>
          Route requests to the AI provider or custom endpoint you choose.
        </li>
        <li>Secure and manage custom provider API keys.</li>
        <li>Enforce rate limits and support stream resumption.</li>
        <li>Provide support, prevent abuse, and protect security.</li>
      </ul>

      <h2>4. Legal Bases</h2>
      <p>
        We process personal information to perform our contract with you, to
        pursue our legitimate interests in operating and securing the service,
        where you have provided consent, and where required to meet legal
        obligations.
      </p>

      <h2>5. Sharing</h2>
      <p>
        We share information with the AI providers or custom endpoints you
        select, with Clerk for authentication, and with hosting, database, and
        Redis infrastructure providers that help us operate the service. We may
        also disclose information where required by law or to protect the
        rights, safety, or security of Visbyr Chat, our users, or others. We do
        not sell personal information.
      </p>

      <h2>6. Retention</h2>
      <p>
        We keep account information while your account is active. Chats,
        documents, and attachments remain available until you delete them.
        Custom provider configurations and keys, and your synced preferences,
        remain stored until you remove them. Usage and rate-limit records are
        kept only as long as needed for the purposes described in this policy.
      </p>

      <h2>7. Security</h2>
      <p>
        Custom provider API keys are encrypted before storage. We use HTTPS,
        access controls, and standard security practices to protect data in
        transit and at rest. No method of transmission or storage is completely
        secure, and we cannot guarantee absolute security.
      </p>

      <h2>8. International Transfers</h2>
      <p>
        Your information may be processed in countries where Visbyr Chat, its
        infrastructure providers, or the AI providers you select operate. Where
        required by applicable law, we rely on appropriate safeguards for
        international transfers.
      </p>

      <h2>9. Your Rights and Choices</h2>
      <p>
        Depending on where you live, you may have rights to access, correct,
        export, delete, or object to certain processing of your personal
        information. You can export chats and attachments from Settings and
        delete chats from the sidebar. For account deletion or other privacy
        requests, contact us at{" "}
        <a href="mailto:support@visbyr.com">support@visbyr.com</a>.
      </p>

      <h2>10. Children</h2>
      <p>
        Visbyr Chat is not intended for users under 16 or the applicable age of
        consent in their jurisdiction. If we learn that we have collected
        personal information from a child, we will take steps to delete it.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. The effective date
        at the top of this page reflects the latest revision, and material
        changes will be communicated through the service.
      </p>

      <h2>12. Contact</h2>
      <p>
        To exercise your privacy rights or ask questions about this policy,
        email <a href="mailto:support@visbyr.com">support@visbyr.com</a>.
      </p>
    </>
  );
}
