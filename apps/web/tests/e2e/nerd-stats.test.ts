import { expect, type Page, test } from "@playwright/test";
import { signIn } from "../helpers";

test.describe("Stats for nerds", () => {
  test("shows model label and stats popover when enabled", async ({ page }) => {
    await signIn(page);

    const providerRes = await page.request.post("/api/settings/providers", {
      data: {
        apiKey: "mock-key",
        baseURL: "http://localhost:9999/v1",
        name: "Mock Provider",
        type: "openai",
      },
    });
    expect(providerRes.status()).toBe(201);
    const provider = await providerRes.json();

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

    await page.goto("/");
    await page.waitForSelector("[data-testid='multimodal-input']", {
      timeout: 30_000,
    });

    await page
      .getByTestId("user-nav-item-settings")
      .evaluate((el) => (el as HTMLElement).click());
    await page.getByTestId("stats-for-nerds-toggle").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings-dialog")).not.toBeVisible();

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

    await page.getByTestId("multimodal-input").fill("Hello");
    await page.getByTestId("send-button").click();
    await page.waitForSelector("[data-testid='message-assistant']", {
      timeout: 60_000,
    });
    await page.waitForSelector("[data-testid='message-fork']", {
      timeout: 60_000,
    });

    const assistant = page.getByTestId("message-assistant").first();
    await expect(assistant.getByTestId("message-model-label")).toContainText(
      "Mock Chat Model"
    );
    await assistant.hover();
    await assistant.getByTestId("message-stats-button").click();
    await expectStatsContent(page);

    await page.reload();
    const reloadedAssistant = page.getByTestId("message-assistant").first();
    await expect(
      reloadedAssistant.getByTestId("message-model-label")
    ).toContainText("Mock Chat Model");
    await reloadedAssistant.hover();
    await reloadedAssistant.getByTestId("message-stats-button").click();
    await expectStatsContent(page);
  });
});

async function expectStatsContent(page: Page) {
  const statsContent = page.getByTestId("message-stats-content");
  await expect(statsContent).toBeVisible();
  await expect(statsContent).toContainText("Mock Chat Model");
  const text = await statsContent.innerText();
  expect(text).toMatch(/Tokens \/ second\s+\d+\.\d{2}/);
  expect(text).toMatch(/Time to first token\s+\d+\.\d s/);
  expect(text).toMatch(/Input tokens\s+10/);
  expect(text).toMatch(/Cache hit input tokens\s+0/);
  expect(text).toMatch(/Cache miss input tokens\s+10/);
  expect(text).toMatch(/Output tokens\s+20/);
  expect(text).toMatch(/Reasoning tokens\s+0/);
}
