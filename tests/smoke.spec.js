const { test, expect } = require("@playwright/test");

test("formats JSON and switches between viewer tabs", async ({ page }) => {
  await page.goto("/");
  await page.locator("#json-input").fill('{"hello":"world","count":2}');
  await page.locator("#format-btn").click();
  await expect(page.locator("#json-input")).toHaveValue(`{
  "hello": "world",
  "count": 2
}`);
  await expect(page.locator("#tree-root")).toBeVisible();

  await page.locator("#api-view-tab").click();
  await expect(page.locator("#api-view-panel")).toBeVisible();
  await page.locator("#json-view-tab").click();
  await expect(page.locator("#json-view-panel")).toBeVisible();
});

test("shows HTML API responses as text without executing scripts", async ({ page }) => {
  await page.route("https://example.test/data", route => route.fulfill({
    status: 200,
    contentType: "text/html",
    headers: { "access-control-allow-origin": "*" },
    body: '<script>window.apiScriptRan = true</script><p>Response text</p>'
  }));

  await page.goto("/");
  await page.locator("#api-view-tab").click();
  await page.locator("#api-url").fill("https://example.test/data");
  await page.locator("#api-send").click();

  const responseBody = page.locator("#api-response-body");
  await expect(responseBody).toBeVisible();
  await expect(responseBody).toContainText("<script>window.apiScriptRan = true</script>");
  expect(await page.evaluate(() => window.apiScriptRan)).toBeUndefined();
});
