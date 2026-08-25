import { expect, test } from "@playwright/test";

const MODELS_PAYLOAD = {
  capabilities: {
    "openai/gpt-4o-mini": {
      reasoning: true,
      reasoningEfforts: ["low", "medium", "high"],
      tools: true,
      vision: true,
    },
  },
  models: [
    {
      description: "Test model",
      id: "openai/gpt-4o-mini",
      name: "GPT-4o mini",
      provider: "OpenAI",
      providerKey: "openai",
    },
  ],
  providerNames: { OpenAI: "OpenAI" },
};

test.use({ viewport: { height: 844, width: 390 } });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/models", (route) =>
    route.fulfill({
      contentType: "application/json",
      json: MODELS_PAYLOAD,
    })
  );
});

test("keeps composer visible when the visible viewport shrinks", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByTestId("multimodal-input");

  await expect(input).toBeVisible();
  await input.focus();
  await page.setViewportSize({ height: 520, width: 390 });

  await expect(input).toBeVisible();

  const composerBox = await input.boundingBox();
  const composerBottom = composerBox ? composerBox.y + composerBox.height : -1;
  const visibleHeight = await page.evaluate(
    () => window.visualViewport?.height ?? window.innerHeight
  );

  expect(composerBox).not.toBeNull();
  expect(composerBox?.y).toBeGreaterThanOrEqual(0);
  expect(composerBottom).toBeLessThanOrEqual(visibleHeight + 1);
});

test("model picker keeps search focus and stays in the visible viewport", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByTestId("model-selector")).toBeEnabled();
  await page.getByTestId("multimodal-input").focus();
  await page.setViewportSize({ height: 520, width: 390 });
  await page.getByTestId("model-selector").click();

  const searchInput = page.getByPlaceholder("Search models...");
  const popover = page.locator("[data-slot='popover-content']");

  await expect(searchInput).toBeFocused();
  await expect(popover).toBeVisible();

  const box = await popover.boundingBox();
  const boxBottom = box ? box.y + box.height : -1;
  const visibleHeight = await page.evaluate(
    () => window.visualViewport?.height ?? window.innerHeight
  );

  expect(box).not.toBeNull();
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect(boxBottom).toBeLessThanOrEqual(visibleHeight + 1);

  await page.locator("[data-slot='command-item']").first().click();

  await expect(searchInput).toBeFocused();
  await expect(popover).toBeVisible();
});

test("confirming model selection restores composer focus", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("model-selector")).toBeEnabled();
  await page.getByTestId("model-selector").click();
  await expect(page.getByPlaceholder("Search models...")).toBeFocused();

  const modelItem = page.locator("[data-slot='command-item']").first();
  await modelItem.click();
  await expect(page.getByPlaceholder("Search models...")).toBeFocused();
  await modelItem.click();

  await expect(page.getByTestId("multimodal-input")).toBeFocused();
});
