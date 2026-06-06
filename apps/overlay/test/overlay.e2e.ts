import { expect, test } from "@playwright/test";

const sellerConsoleUrl =
  "/?mode=seller&runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=live-vintage-jewelry-001";
const publicOverlayUrl =
  "/?runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=live-vintage-jewelry-001";

test("public overlay does not expose seller controls", async ({ page }) => {
  await page.goto(publicOverlayUrl);
  await expect(page.getByLabel("LiveSeller livestream overlay")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Start show");
  await expect(page.locator("body")).not.toContainText("Send caption");
  await expect(page.locator("body")).not.toContainText("Live guidance");
  await expect(page.locator("body")).not.toContainText("Buyer context");
  await expect(page.locator("body")).not.toContainText("rtmp://");
  await expect(page.locator("body")).not.toContainText("streamKey");
});

test("seller console receives runtime guidance without exposing stream secrets", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      logs.push(`${message.type()}: ${message.text()}`);
    }
  });

  await page.goto(sellerConsoleUrl);
  await expect(page.getByRole("heading", { name: "Vintage Jewelry Live Showcase" })).toBeVisible();

  await page.getByRole("button", { name: "Send to runtime" }).click();

  await expect(page.getByLabel("Live guidance")).toContainText("Say this");
  await expect(page.getByLabel("Live guidance")).toContainText("Top questions");
  await expect(page.getByLabel("Live guidance")).toContainText("Session summary");
  await expect(page.locator("body")).not.toContainText("rtmp://");
  await expect(page.locator("body")).not.toContainText("streamKey");
  expect(logs).toEqual([]);
});
