import { expect, test } from "@playwright/test";

// This suite intentionally does NOT call signIn() – it verifies auth
// paths without the PLAYWRIGHT test-user bypass cookie. No test-user
// cookie is set, so auth() returns null and API routes should respond
// with 401/403. This covers the auth bypass gap noted in #116.

test.describe("Auth paths without PLAYWRIGHT bypass", () => {
  test("GET /api/models without auth returns 401", async ({ page }) => {
    // Use a fresh page context without cookies – do not call signIn
    const response = await page.request.get("/api/models");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("unauthorized:chat");
  });

  test("POST /api/chat without auth returns 401", async ({ page }) => {
    const response = await page.request.post("/api/chat", {
      data: {
        id: "00000000-0000-4000-a000-000000000000",
        message: {
          id: "00000000-0000-4000-a000-000000000001",
          parts: [{ text: "hello", type: "text" }],
          role: "user",
        },
        selectedChatModel: "custom-unknown/model",
        selectedVisibilityType: "private",
      },
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.code).toMatch(/unauthorized/);
  });

  test("GET /api/history without auth returns 401 or redirect", async ({
    page,
  }) => {
    // No signIn – expect auth to fail
    const response = await page.request.get("/api/history");
    // History route should reject unauthenticated requests
    expect([401, 403]).toContain(response.status());
  });

  test("page.request without cookie cannot access protected API", async ({
    browser,
  }) => {
    // Create a completely isolated context with no storage
    const context = await browser.newContext();
    const req = context.request;
    const res = await req.get("/api/models");
    // Should still be 401 even with fresh context
    expect(res.status()).toBe(401);
    await context.close();
  });
});
