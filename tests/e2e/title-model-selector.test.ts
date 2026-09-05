import { expect, test } from "@playwright/test";
import { signIn } from "../helpers";

test.describe("Title Model Selector", () => {
  test.beforeEach(async ({ page }) => {
    // Sign in as a mock test-mode user (no Clerk needed).
    await signIn(page);

    // Mock the model catalog.
    await page.route("**/api/models", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        json: {
          capabilities: {
            "custom-test/deepseek-v3.2": {
              reasoning: true,
              tools: true,
              vision: false,
            },
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
              id: "custom-test/deepseek-v3.2",
              name: "DeepSeek V3.2",
              provider: "custom-test",
              providerKey: "deepseek",
            },
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

    await page.goto("/settings");
  });

  test("shows 'Use active chat model' as the default selection", async ({
    page,
  }) => {
    const trigger = page.getByTestId("model-selector");
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText("Use active chat model");
  });

  test("shows 'Use active chat model' as the first option in the picker", async ({
    page,
  }) => {
    await page.getByTestId("model-selector").click();

    await expect(
      page.getByRole("option", { name: "Use active chat model" })
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: /DeepSeek V3\.2/ })
    ).toBeVisible();
  });

  test("selects a model with multiple efforts, configures effort, and persists", async ({
    page,
  }) => {
    const trigger = page.getByTestId("model-selector");
    await trigger.click();

    const kimiOption = page.getByRole("option", { name: /Kimi K2\.5/ });
    await kimiOption.click();

    await expect(page.getByTestId("reasoning-effort-picker")).toBeVisible();
    await expect(kimiOption).toContainText("Tap to confirm");

    const mediumEffort = page.getByRole("button", {
      name: "Set reasoning effort to medium",
    });
    await mediumEffort.click();

    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
    await expect(trigger).toContainText("Kimi K2.5");
    await expect(trigger).toContainText("Medium");

    const cookies = await page.context().cookies();
    const titleModel = cookies.find((c) => c.name === "title-model");
    const titleEffort = cookies.find(
      (c) => c.name === "title-reasoning-effort"
    );
    expect(decodeURIComponent(titleModel?.value ?? "")).toBe(
      "custom-test/kimi-k2.5"
    );
    expect(titleEffort?.value).toBe("medium");
  });

  test("selects a default-only model immediately", async ({ page }) => {
    const trigger = page.getByTestId("model-selector");
    await trigger.click();

    await page.getByRole("option", { name: /DeepSeek V3\.2/ }).click();

    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
    await expect(trigger).toContainText("DeepSeek V3.2");
  });

  test("reselecting 'Use active chat model' clears the selection", async ({
    page,
  }) => {
    const trigger = page.getByTestId("model-selector");
    await trigger.click();
    await page.getByRole("option", { name: /Kimi K2\.5/ }).click();
    await page.getByRole("option", { name: /Kimi K2\.5/ }).click();
    await expect(trigger).toContainText("Kimi K2.5");

    await trigger.click();
    await page.getByRole("option", { name: "Use active chat model" }).click();

    await expect(trigger).toContainText("Use active chat model");

    const cookies = await page.context().cookies();
    const titleModel = cookies.find((c) => c.name === "title-model");
    expect(titleModel?.value).toBe("");
  });

  test("keeps a long model list scrollable", async ({ page }) => {
    const models = Array.from({ length: 40 }, (_, i) => ({
      description: "Test provider",
      id: `custom-test/model-${String(i).padStart(2, "0")}`,
      name: `Model Number ${String(i).padStart(2, "0")}`,
      provider: "custom-test",
      providerKey: "openai",
    }));

    await page.route("**/api/models", (route) =>
      route.fulfill({
        contentType: "application/json",
        json: {
          capabilities: {},
          models,
          providerNames: { "custom-test": "Available" },
        },
      })
    );
    await page.goto("/settings");

    await page.getByTestId("model-selector").click();

    const list = page.locator("[data-slot='command-list']");
    await expect(list).toBeVisible();

    await expect
      .poll(() => list.evaluate((el) => el.scrollHeight > el.clientHeight))
      .toBe(true);

    // Deterministic: verify the list can actually scroll (not just overflow).
    await list.evaluate((el) => {
      el.scrollTop = 0;
      el.scrollTop = 100;
    });
    await expect
      .poll(() => list.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);

    // Smoke: wheel over the list still scrolls it (no scroll-lock cancellation).
    await list.evaluate((el) => {
      el.scrollTop = 0;
    });
    await list.hover();
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => list.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
  });
});
