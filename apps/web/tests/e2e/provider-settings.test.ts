import { expect, test } from "@playwright/test";
import { signIn } from "../helpers";

/**
 * Regression tests for provider settings regressions:
 * 1. Success/error toasts for provider actions (test connection, auto-detect,
 *    refresh from catalog) must render inside the viewport. The sonner Toaster
 *    used to be mounted inside the sidebar's transformed <main>, which became
 *    the containing block for its position:fixed portal — toasts rendered
 *    above the visible viewport whenever the page was scrolled.
 * 2. Custom models must be listed in a deterministic (alphabetical) order
 *    instead of the arbitrary order of batch inserts (identical createdAt).
 */
test.describe("Provider Settings", () => {
  test("test-connection toast is visible in the viewport", async ({ page }) => {
    // Sign in as a mock test-mode user (no Clerk needed).
    await signIn(page);
    await page.goto("/");

    // Create a provider via API. baseURL is unreachable on purpose: we only
    // need the failure toast to be visible.
    const created = await page.evaluate(async () => {
      const response = await fetch("/api/settings/providers", {
        body: JSON.stringify({
          apiKey: "sk-test",
          baseURL: "http://127.0.0.1:1/v1",
          name: "Toast Provider",
          type: "openai",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      return { id: (await response.json()).id, status: response.status };
    });
    expect(created.status).toBe(201);

    await page.goto("/settings");
    await page.getByRole("button", { name: /Providers/i }).click();
    const toastProviderCard = page
      .locator("div.rounded-xl.border")
      .filter({ hasText: "Toast Provider" });
    const testConnectionButton = toastProviderCard.getByRole("button", {
      name: "Test connection",
    });
    await expect(testConnectionButton).toBeVisible();

    // Click the test connection button, then assert the toast is inside the
    // visible viewport (this failed before the fix: toasts rendered at
    // negative y-offsets, i.e. above the screen). The toast slides in from
    // above, so wait for it to settle before measuring.
    await testConnectionButton.click();
    const toast = page.locator("[data-testid=toast]").first();
    await expect(toast).toBeVisible();
    await expect
      .poll(
        async () => {
          const box = await toast.boundingBox();
          if (!box) {
            return Number.NEGATIVE_INFINITY;
          }
          return box.y;
        },
        { timeout: 5000 }
      )
      .toBeGreaterThanOrEqual(0);
    const box = (await toast.boundingBox()) ?? {
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    };
    const viewport = page.viewportSize() ?? { height: 720, width: 1280 };
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });

  test("custom models are listed in alphabetical order", async ({ page }) => {
    await signIn(page);
    await page.goto("/");

    const provider = await page.evaluate(async () => {
      const response = await fetch("/api/settings/providers", {
        body: JSON.stringify({
          apiKey: "sk-test",
          baseURL: "http://127.0.0.1:1/v1",
          name: "Order Provider",
          type: "openai",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      return (await response.json()) as { id: string };
    });

    // Insert models in deliberately non-alphabetical order with identical
    // capabilities; before the fix they were ordered by createdAt, which is
    // identical for batch inserts and therefore arbitrary.
    const insert = await page.evaluate(async (providerId) => {
      const response = await fetch(
        `/api/settings/providers/${providerId}/models`,
        {
          body: JSON.stringify({
            models: [
              {
                capabilities: { reasoning: false, tools: true, vision: false },
                modelId: "zeta-model",
                name: "Zeta",
              },
              {
                capabilities: { reasoning: false, tools: true, vision: false },
                modelId: "alpha-model",
                name: "Alpha",
              },
              {
                capabilities: { reasoning: false, tools: true, vision: false },
                modelId: "mike-model",
                name: "Mike",
              },
            ],
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );
      return { status: response.status };
    }, provider.id);
    expect(insert.status).toBe(201);

    const models = await page.evaluate(async (providerId) => {
      const response = await fetch(
        `/api/settings/providers/${providerId}/models`
      );
      return (await response.json()) as Array<{
        modelId: string;
        name: string;
      }>;
    }, provider.id);

    expect(models.map((m) => m.modelId)).toEqual([
      "alpha-model",
      "mike-model",
      "zeta-model",
    ]);
    expect(models.map((m) => m.name)).toEqual(["Alpha", "Mike", "Zeta"]);
  });

  test("selecting a catalog provider shows only the API key field", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/");

    // Open Settings -> Providers
    await page
      .getByTestId("user-nav-item-settings")
      .evaluate((el) => (el as HTMLElement).click());
    await page.getByRole("button", { name: /Providers/i }).click();

    await page.getByRole("button", { name: "Add Provider" }).click();

    // Pick a known provider from the models.dev catalog.
    await page.getByPlaceholder("Search providers...").fill("Anthropic");
    await page
      .getByRole("option")
      .filter({ hasText: "Anthropic" })
      .first()
      .click();

    // The preconfigured view should only ask for the API key: the prefilled
    // name and base URL are hidden behind the advanced options collapsible.
    const apiKeyInput = page.getByLabel("API Key");
    await expect(apiKeyInput).toBeVisible();
    await expect(page.getByLabel("Provider Name")).not.toBeVisible();
    await expect(page.getByLabel("Base URL")).not.toBeVisible();

    // Submit and confirm the provider appears in the list.
    const addDialog = page.getByRole("dialog").last();
    await apiKeyInput.fill("sk-test");
    await addDialog.getByRole("button", { name: "Add Provider" }).click();

    await expect(page.getByText("Provider added successfully")).toBeVisible();
    const providerCard = page
      .locator("div.rounded-xl.border")
      .filter({ hasText: "Anthropic" });
    await expect(providerCard).toBeVisible();
  });
});
