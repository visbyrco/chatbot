import crypto from "node:crypto";
import type { Page } from "@playwright/test";

export function generateTestUserEmail(prefix = "test") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@playwright.com`;
}

function signEmail(email: string): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    return email;
  }
  const sig = crypto
    .createHmac("sha256", secret)
    .update(email, "utf8")
    .digest("hex");
  return `${email}|${sig}`;
}

/**
 * Signs in a mock test-mode user by setting the `test-user` cookie that
 * `app/(auth)/auth.ts` reads when `PLAYWRIGHT=True`. This keeps the e2e tests
 * independent of Clerk.
 */
export async function signIn(page: Page, email = generateTestUserEmail()) {
  const value = signEmail(email);
  await page
    .context()
    .addCookies([{ name: "test-user", url: "http://localhost", value }]);
  return email;
}
