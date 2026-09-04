import { expect, test } from "@playwright/test";
import { signIn } from "../helpers";

test.describe("Model Selector", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);

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
    await page.goto("/");
  });

  test("displays a model button", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await expect(modelButton).toBeVisible();
  });

  test("opens model selector popover on click", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    await expect(page.getByPlaceholder("Search models...")).toBeVisible();
  });

  test("can search for models", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    const searchInput = page.getByPlaceholder("Search models...");
    await searchInput.fill("DeepSeek");

    await expect(
      page.getByRole("option", { name: /DeepSeek V3\.2/ })
    ).toBeVisible();
  });

  test("can close model selector by clicking outside", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    await expect(page.getByPlaceholder("Search models...")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
  });

  test("shows available models", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    const availableModels = page.getByRole("group", { name: "Available" });
    await expect(availableModels).toBeVisible();
    await expect(
      availableModels.getByRole("option", { name: /DeepSeek V3\.2/ })
    ).toBeVisible();
    await expect(
      availableModels.getByRole("option", { name: /Kimi K2\.5/ })
    ).toBeVisible();
  });

  test("selects a default-only model immediately", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    await page.getByRole("option", { name: /DeepSeek V3\.2/ }).click();

    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
    await expect(modelButton).toContainText("DeepSeek V3.2");
  });

  test("keeps the picker open to configure a model with reasoning levels", async ({
    page,
  }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    const kimiOption = page.getByRole("option", { name: /Kimi K2\.5/ });
    await kimiOption.click();

    await expect(page.getByPlaceholder("Search models...")).toBeVisible();
    await expect(page.getByTestId("reasoning-effort-picker")).toBeVisible();
    await expect(modelButton).toContainText("DeepSeek V3.2");
    await expect(kimiOption).toContainText("Tap to confirm");
  });

  test("confirms the default reasoning level by clicking the model again", async ({
    page,
  }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    const kimiOption = page.getByRole("option", { name: /Kimi K2\.5/ });
    await kimiOption.click();
    await kimiOption.click();

    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
    await expect(modelButton).toContainText("Kimi K2.5");
    await expect(modelButton).not.toContainText("high");
  });

  test("applies the reasoning effort immediately when selected", async ({
    page,
  }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    const kimiOption = page.getByRole("option", { name: /Kimi K2\.5/ });
    await kimiOption.click();

    const highEffort = page.getByRole("button", {
      name: "Set reasoning effort to high",
    });
    await highEffort.click();

    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
    await expect(modelButton).toContainText("Kimi K2.5");
    await expect(modelButton).toContainText("High");
  });

  test("updates the effort label when changing the effort of the already-selected model", async ({
    page,
  }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    const kimiOption = page.getByRole("option", { name: /Kimi K2\.5/ });
    await kimiOption.click();
    await page
      .getByRole("button", { name: "Set reasoning effort to high" })
      .click();
    await expect(modelButton).toContainText("Kimi K2.5");
    await expect(modelButton).toContainText("High");

    // Wait for the popover to fully unmount before reopening. Radix keeps the
    // content mounted during the close animation, and clicking the trigger in
    // that window can leave it stuck closed (trigger expanded, content closed).
    await expect(page.locator("[data-slot='popover-content']")).toHaveCount(0);

    await modelButton.click();
    // Reopening the picker for an already-selected reasoning model shows its
    // effort picker directly, so changing the effort is a single click.
    await expect(page.getByTestId("reasoning-effort-picker")).toBeVisible();
    await page
      .getByRole("button", { name: "Set reasoning effort to medium" })
      .click();

    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
    await expect(modelButton).toContainText("Kimi K2.5");
    await expect(modelButton).toContainText("Medium");
  });

  test("supports keyboard interaction on the reasoning slider", async ({
    page,
  }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();
    await page.getByRole("option", { name: /Kimi K2\.5/ }).click();

    // The radix slider puts role="slider" on the focusable thumb (the
    // aria-label lives on the wrapping root), so scope within the picker
    // instead of matching by accessible name.
    const slider = page
      .locator("[data-testid='reasoning-effort-picker']")
      .getByRole("slider");
    await slider.focus();
    await slider.press("End");

    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
    await expect(modelButton).toContainText("Kimi K2.5");
    await expect(modelButton).toContainText("Max");
  });
});
