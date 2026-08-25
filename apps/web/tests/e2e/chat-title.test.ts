import { expect, test } from "@playwright/test";

import { signIn } from "../helpers";

test.describe("Chat Title Rename & Regenerate", () => {
  test("renames a chat via menu and double-click, regenerates title, and reverts empty titles", async ({
    page,
  }) => {
    // 1. Sign in via the mock test-mode cookie. The in-memory store
    //    auto-seeds a "Mock Provider" + "Mock Chat Model" for the user.
    //    Also open the sidebar: without the cookie the sidebar starts
    //    collapsed and the history chat links are zero-size (hidden).
    await signIn(page);
    await page
      .context()
      .addCookies([
        { name: "sidebar_state", url: "http://localhost", value: "true" },
      ]);

    // 2. Open a new chat. The default-model effect picks the auto-seeded
    //    model and sets the chat-model cookie, so no manual selection needed.
    await page.goto("/");
    await page.waitForSelector("[data-testid='multimodal-input']", {
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => document.cookie.includes("chat-model="),
      undefined,
      { timeout: 30_000 }
    );

    // 3. Send a first message so a chat is created and a title is generated.
    await page.getByTestId("multimodal-input").fill("Hello");
    await page.getByTestId("send-button").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-testid='message-assistant']").length >=
        1,
      undefined,
      { timeout: 60_000 }
    );
    await page.waitForSelector("[data-testid='message-fork']", {
      timeout: 60_000,
    });
    // Let the history refetch land so the chat row appears in the sidebar.
    await page.waitForTimeout(1500);

    const sidebarLink = page.locator("a[href*='/chat/']").first();
    await expect(sidebarLink).toBeVisible();

    const chatItem = page
      .locator("li[data-slot='sidebar-menu-item']")
      .filter({ has: sidebarLink });
    const titleInput = page.getByTestId("chat-title-input");

    // 4. Rename via the three-dot menu.
    await chatItem.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await expect(titleInput).toBeVisible();
    await titleInput.fill("My custom title");
    await titleInput.press("Enter");
    await expect(sidebarLink).toContainText("My custom title");

    // 5. Rename via double-clicking the sidebar title. Note: a full
    //    dblclick() gesture can't be used here — the first click triggers
    //    the Link's client-side navigation, which refetches history and
    //    replaces the link node before the second click, so the dblclick
    //    event never reaches the live element. Dispatching the event
    //    directly exercises the same onDoubleClick handler.
    await sidebarLink.dispatchEvent("dblclick");
    await expect(titleInput).toBeVisible();
    await titleInput.fill("Double clicked title");
    await titleInput.press("Enter");
    await expect(sidebarLink).toContainText("Double clicked title");

    // 6. Regenerate the title from the first user message. The mock model
    //    checks "weather" before "hello", and the title prompt's examples
    //    include "what's the weather in nyc", so the mock title is the
    //    weather response.
    await chatItem.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Regenerate title" }).click();
    await expect(sidebarLink).toContainText(
      "The weather in San Francisco is sunny and 72°F.",
      { timeout: 60_000 }
    );

    // 7. An empty/whitespace-only rename reverts to the previous title.
    await chatItem.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await expect(titleInput).toBeVisible();
    await titleInput.fill("   ");
    await titleInput.press("Enter");
    await expect(sidebarLink).toContainText(
      "The weather in San Francisco is sunny and 72°F."
    );
  });
});
