import { expect, test } from "@playwright/test";

test.describe("SEO metadata", () => {
  test("robots.txt disallows private app routes", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.ok()).toBeTruthy();

    const body = await response.text();
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Disallow: /chat/");
    expect(body).toContain("Disallow: /settings");
  });

  test("root emits complete metadata and accessible social images", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    expect(await page.title()).toContain("Visbyr Chat");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /bring-your-own-key/i
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Visbyr Chat"
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image"
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/i
    );

    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).toBeTruthy();

    const socialImages = [
      await page.locator('meta[property="og:image"]').getAttribute("content"),
      await page.locator('meta[name="twitter:image"]').getAttribute("content"),
    ];

    const urls = socialImages.filter((imageUrl): imageUrl is string =>
      Boolean(imageUrl)
    );
    expect(urls).toHaveLength(2);

    const responses = await Promise.all(
      urls.map((imageUrl) => {
        const url = new URL(imageUrl);
        return request.get(`${url.pathname}${url.search}`);
      })
    );

    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });

  test("settings emits its title and noindex", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("domcontentloaded");

    expect(await page.title()).toMatch(
      /Settings.*Visbyr Chat|Visbyr Chat.*Settings/
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/i
    );
  });
});
