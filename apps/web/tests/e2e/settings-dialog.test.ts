import { expect, test } from "@playwright/test";
import { signIn } from "../helpers";

test.describe("Settings Dialog", () => {
  test("opens settings from the user nav and switches sections", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/");

    await page
      .getByTestId("user-nav-item-settings")
      .evaluate((el) => (el as HTMLElement).click());

    await expect(page.getByTestId("settings-dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Chat preferences" })
    ).toBeVisible();

    await page.getByRole("button", { name: /Providers/i }).click();

    await expect(
      page.getByRole("heading", { name: "Providers & models" })
    ).toBeVisible();
  });

  test("direct settings route opens the modal and closes back home", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/settings");

    await expect(page.getByTestId("settings-dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("settings-dialog")).not.toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
