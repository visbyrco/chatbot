import { expect, test } from "@playwright/test";
import { signIn } from "../helpers";

function buildModels() {
  const models: {
    description: string;
    id: string;
    name: string;
    provider: string;
    providerKey: string;
  }[] = [];
  for (let i = 1; i <= 60; i += 1) {
    models.push({
      description: "Big provider",
      id: `custom-big/model-${String(i).padStart(2, "0")}`,
      name: `Big Model ${String(i).padStart(2, "0")}`,
      provider: "custom-big",
      providerKey: "openai",
    });
  }
  for (let i = 1; i <= 5; i += 1) {
    models.push({
      description: "Small provider",
      id: `custom-small/s-model-${i}`,
      name: `Small Model ${i}`,
      provider: "custom-small",
      providerKey: "moonshotai",
    });
  }
  return models;
}

test.describe("Model Selector pagination", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);

    await page.route("**/api/models", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        json: {
          capabilities: {},
          models: buildModels(),
          providerNames: {
            "custom-big": "Big Provider",
            "custom-small": "Small Provider",
          },
        },
      });
    });
    await page.goto("/");
  });

  async function openPicker(page) {
    await page.getByTestId("model-selector").click();
    await expect(page.getByPlaceholder("Search models...")).toBeVisible();
  }

  test("renders the first page with a count and a show-more button", async ({
    page,
  }) => {
    await openPicker(page);

    await expect(page.getByRole("option")).toHaveCount(50);
    await expect(page.getByText("Showing 50 of 65 models")).toBeVisible();
    await expect(page.getByTestId("model-picker-show-more")).toBeVisible();
  });

  test("round-robin keeps trailing providers visible on the first page", async ({
    page,
  }) => {
    await openPicker(page);

    const smallGroup = page.getByRole("group", { name: "Small Provider" });
    await expect(smallGroup).toBeVisible();
    await expect(smallGroup.getByRole("option")).toHaveCount(5);
  });

  test("show more reveals the remaining models", async ({ page }) => {
    await openPicker(page);

    await page.getByTestId("model-picker-show-more").click();

    await expect(page.getByRole("option")).toHaveCount(65);
    await expect(page.getByText("Showing 50 of 65 models")).not.toBeVisible();
    await expect(page.getByTestId("model-picker-show-more")).not.toBeVisible();
  });

  test("search narrows results and hides pagination", async ({ page }) => {
    await openPicker(page);

    await page.getByPlaceholder("Search models...").fill("Small Model");

    await expect(page.getByRole("option")).toHaveCount(5);
    await expect(page.getByTestId("model-picker-show-more")).not.toBeVisible();
  });

  test("search matches the provider key", async ({ page }) => {
    await openPicker(page);

    await page.getByPlaceholder("Search models...").fill("moonshotai");

    await expect(page.getByRole("option")).toHaveCount(5);
    await expect(
      page.getByRole("option", { name: /Small Model 1/ })
    ).toBeVisible();
  });

  test("shows an empty state when nothing matches", async ({ page }) => {
    await openPicker(page);

    await page.getByPlaceholder("Search models...").fill("zzz-no-such-model");

    await expect(page.getByText("No models found.")).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(0);
  });
});
