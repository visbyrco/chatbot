import { expect, type Page, test } from "@playwright/test";
import { signIn } from "../helpers";

const CHAT_URL_REGEX = /\/chat\/[\w-]+/;

test.use({ viewport: { height: 844, width: 390 } });

async function seedMockModel(page: Page) {
  const providerRes = await page.request.post("/api/settings/providers", {
    data: {
      apiKey: "mock-key",
      baseURL: "http://localhost:9999/v1",
      name: `Mock Provider ${Date.now()}`,
      type: "openai",
    },
  });
  expect(providerRes.status()).toBe(201);
  const provider = (await providerRes.json()) as { id: string };

  const modelRes = await page.request.post(
    `/api/settings/providers/${provider.id}/models`,
    {
      data: {
        capabilities: { reasoning: false, tools: true, vision: false },
        modelId: "chat-model",
        name: "Mock Chat Model",
      },
    }
  );
  expect(modelRes.status()).toBe(201);
}

async function selectMockModel(page: Page) {
  await page.waitForFunction(
    () => {
      const button = document.querySelector("[data-testid='model-selector']");
      return (
        button &&
        !(button as HTMLButtonElement).disabled &&
        button.textContent?.includes("Mock Chat Model")
      );
    },
    undefined,
    { timeout: 30_000 }
  );

  const trySelectModel = async (): Promise<boolean> => {
    await page.getByTestId("model-selector").click();
    try {
      await page.waitForSelector("[cmdk-item]", { timeout: 3000 });
      await page.waitForTimeout(600);
      await page
        .locator("[cmdk-item]")
        .filter({ hasText: "Mock Chat Model" })
        .first()
        .click({ force: true, timeout: 3000 });
      await page.waitForFunction(
        () => document.cookie.includes("chat-model="),
        undefined,
        { timeout: 3000 }
      );
      return true;
    } catch {
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.waitForTimeout(400);
      return false;
    }
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: retries must run sequentially
    if (await trySelectModel()) {
      break;
    }
  }
  expect(await page.evaluate(() => document.cookie)).toContain("chat-model=");
}

async function sendAndWaitForAssistant(
  page: Page,
  text: string,
  expectedCount: number
) {
  await page.getByTestId("multimodal-input").fill(text);
  await page.getByTestId("send-button").click();
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll("[data-testid='message-assistant']").length >=
      count,
    expectedCount,
    { timeout: 60_000 }
  );
  await expect(
    page
      .locator("[data-testid='message-assistant']")
      .last()
      .getByTestId("message-actions-mobile-trigger")
  ).toBeVisible();
}

test("mobile message menus expose edit, copy, fork, and nerd stats", async ({
  page,
}) => {
  await signIn(page);
  await seedMockModel(page);
  await page.goto("/settings");
  await expect(page.getByTestId("stats-for-nerds-toggle")).toBeVisible();
  await page.getByTestId("stats-for-nerds-toggle").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("multimodal-input")).toBeVisible();
  await selectMockModel(page);
  await sendAndWaitForAssistant(page, "Hello", 1);

  const userMessage = page.locator("[data-testid='message-user']").first();
  const userTrigger = userMessage.getByTestId("message-actions-mobile-trigger");
  await expect(userTrigger).toBeVisible();

  const userTriggerBox = await userTrigger.boundingBox();
  expect(userTriggerBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(userTriggerBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  await userTrigger.click();
  const menu = page.getByTestId("message-actions-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId("message-edit-mobile")).toBeVisible();
  await expect(menu.getByTestId("message-copy-mobile")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();

  const assistantMessage = page
    .locator("[data-testid='message-assistant']")
    .first();
  await expect(
    assistantMessage.getByTestId("message-actions-mobile-trigger")
  ).toBeVisible();
  await assistantMessage.getByTestId("message-actions-mobile-trigger").click();
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId("message-copy-mobile")).toBeVisible();
  await expect(menu.getByTestId("message-fork-mobile")).toBeVisible();

  const originalUrl = page.url();
  await menu.getByTestId("message-fork-mobile").click();
  await page.waitForFunction(
    (url) => window.location.href !== url,
    originalUrl,
    { timeout: 30_000 }
  );
  expect(page.url()).toMatch(CHAT_URL_REGEX);
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-testid='message-assistant']").length >=
      1,
    undefined,
    { timeout: 30_000 }
  );

  await sendAndWaitForAssistant(page, "Hello again", 2);

  const statsAssistant = page
    .locator("[data-testid='message-assistant']")
    .last();
  await statsAssistant.getByTestId("message-actions-mobile-trigger").click();
  await expect(menu).toBeVisible();

  const statsItem = menu.getByTestId("message-stats-menu-item");
  await expect(statsItem).toContainText("Stats for nerds");
  await statsItem.click();
  const statsContent = page.getByTestId("message-stats-content");
  await expect(statsContent).toBeVisible();
  await expect(statsContent).toContainText("Tokens / second");
  await expect(statsContent).toContainText("Time to first token");
  await expect(statsContent).toContainText("Input tokens");
  await expect(statsContent).toContainText("Cache hit input tokens");
  await expect(statsContent).toContainText("Cache miss input tokens");
  await expect(statsContent).toContainText("Output tokens");
  await expect(statsContent).toContainText("Reasoning tokens");
});

test("mobile attachment preview exposes remove without hover", async ({
  page,
}) => {
  await signIn(page);
  await page.route("**/api/files/upload", (route) =>
    route.fulfill({
      contentType: "application/json",
      json: {
        contentType: "text/plain",
        name: "note.txt",
        url: "/api/files/note.txt",
      },
    })
  );
  await page.goto("/");
  await expect(page.getByTestId("multimodal-input")).toBeVisible();

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      buffer: Buffer.from("hello"),
      mimeType: "text/plain",
      name: "note.txt",
    });

  const preview = page.getByTestId("input-attachment-preview");
  await expect(preview).toBeVisible();
  const options = preview.getByTestId("attachment-options");
  await expect(options).toBeVisible();
  await options.click();

  const remove = page.getByTestId("attachment-remove");
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(preview).toHaveCount(0);
});
