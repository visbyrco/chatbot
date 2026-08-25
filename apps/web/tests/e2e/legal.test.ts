import { expect, test } from "@playwright/test";
import { signIn } from "../helpers";

test.describe("Legal pages", () => {
  test("privacy page renders public metadata, content, and cross-links", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).toHaveTitle(/Privacy Policy.*Visbyr Chat/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" })
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /index/i
    );

    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).toContain("/privacy");

    await expect(
      page.getByRole("link", { name: "Terms of Service" }).first()
    ).toBeVisible();
    await expect(
      page.locator('a[href="mailto:support@visbyr.com"]').first()
    ).toBeVisible();
  });

  test("terms page renders public metadata, content, and cross-links", async ({
    page,
  }) => {
    await page.goto("/terms");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).toHaveTitle(/Terms of Service.*Visbyr Chat/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Terms of Service" })
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /index/i
    );

    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).toContain("/terms");

    await expect(
      page.getByRole("link", { name: "Privacy Policy" }).first()
    ).toBeVisible();
    await expect(
      page.locator('a[href="mailto:support@visbyr.com"]').first()
    ).toBeVisible();
  });

  test("settings modal exposes the legal section", async ({ page }) => {
    await signIn(page);
    await page.goto("/");

    await page
      .getByTestId("user-nav-item-settings")
      .evaluate((el) => (el as HTMLElement).click());

    await expect(page.getByTestId("settings-dialog")).toBeVisible();
    await page.getByRole("button", { name: /Legal/i }).click();

    await expect(
      page.getByRole("heading", { exact: true, name: "Legal" })
    ).toBeVisible();
    await expect(page.getByTestId("legal-panel")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Privacy Policy/ })
    ).toHaveAttribute("href", "/privacy");
    await expect(
      page.getByRole("link", { name: /Terms of Service/ })
    ).toHaveAttribute("href", "/terms");
    await expect(
      page.getByRole("link", { name: "support@visbyr.com" })
    ).toHaveAttribute("href", "mailto:support@visbyr.com");
  });
});
