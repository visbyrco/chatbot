import { expect, test } from "@playwright/test";
import { generateTestUserEmail, signIn } from "../helpers";

async function mockModels(page: import("@playwright/test").Page) {
  await page.route("**/api/models", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        capabilities: {
          "custom-test/kimi-k2.5": {
            reasoning: true,
            reasoningEfforts: ["low", "medium", "high", "max"],
            tools: true,
            vision: true,
          },
        },
        models: [
          {
            description: "Test provider",
            id: "custom-test/kimi-k2.5",
            name: "Kimi K2.5",
            provider: "custom-test",
            providerKey: "moonshotai",
          },
        ],
        providerNames: { "custom-test": "Available" },
      },
    });
  });
}

test.describe("Preferences sync across devices", () => {
  test("chat settings set on one device apply on another", async ({
    browser,
  }) => {
    const email = generateTestUserEmail();

    // Device A: sign in and set a chat model + reasoning effort.
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await signIn(pageA, email);
    await mockModels(pageA);
    await pageA.goto("/");

    const selectorA = pageA.getByTestId("model-selector");
    await expect(selectorA).toBeVisible();
    await selectorA.click();
    await pageA.getByRole("option", { name: /Kimi K2\.5/ }).click();
    await pageA
      .getByRole("button", { name: "Set reasoning effort to high" })
      .click();
    await expect(selectorA).toContainText("Kimi K2.5");
    await expect(selectorA).toContainText("High");

    // Wait for the debounced push to reach the server.
    await expect
      .poll(async () => {
        const res = await pageA.request.get("/api/settings/preferences");
        const prefs = await res.json();
        return prefs.reasoningEffort;
      })
      .toBe("high");

    // Device B: a fresh browser context for the same user picks it up.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await signIn(pageB, email);
    await mockModels(pageB);
    await pageB.goto("/");

    const selectorB = pageB.getByTestId("model-selector");
    await expect(selectorB).toBeVisible();
    await expect(selectorB).toContainText("Kimi K2.5");
    await expect(selectorB).toContainText("High");

    await contextA.close();
    await contextB.close();
  });
});
