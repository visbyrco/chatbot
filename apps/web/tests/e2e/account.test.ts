import { expect, test } from "@playwright/test";
import { signIn } from "../helpers";

test.describe("Account Dialog", () => {
  let email: string;

  test.beforeEach(async ({ page }) => {
    email = await signIn(page);
    await page.goto("/");
  });

  test("opens the account dialog from the user nav", async ({ page }) => {
    await page.getByTestId("user-nav-button").click();
    await expect(page.getByTestId("user-menu-popover")).toBeVisible();
    await page.getByTestId("user-menu-manage-account").click();

    // Test mode renders the fallback panel instead of Clerk's <UserProfile />.
    await expect(page.getByTestId("account-dialog")).toBeVisible();
    await expect(page.getByTestId("account-dialog-fallback")).toBeVisible();
  });

  test("shows the signed-in email and avatar in the dialog", async ({
    page,
  }) => {
    await page.getByTestId("user-nav-button").click();
    await expect(page.getByTestId("user-menu-popover")).toBeVisible();
    await page.getByTestId("user-menu-manage-account").click();

    await expect(page.getByTestId("account-dialog")).toContainText(email);
    // In test mode user.image is null, so the gradient avatar renders.
    await expect(
      page.getByTestId("account-dialog").getByTestId("user-avatar")
    ).toBeVisible();
  });

  test("closes the account dialog with Escape", async ({ page }) => {
    await page.getByTestId("user-nav-button").click();
    await page.getByTestId("user-menu-manage-account").click();
    await expect(page.getByTestId("account-dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("account-dialog")).not.toBeVisible();
  });

  test("shows user menu popover on user nav click", async ({ page }) => {
    await page.getByTestId("user-nav-button").click();
    await expect(page.getByTestId("user-menu-popover")).toBeVisible();
    await expect(page.getByTestId("user-menu-manage-account")).toBeVisible();
    await expect(page.getByTestId("user-menu-sign-out")).toBeVisible();
  });
});
