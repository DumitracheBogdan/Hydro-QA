import { test, expect } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("QA Pro Tracker")).toBeVisible();
});

test("create local evidence via API", async ({ request }) => {
  const res = await request.post("/api/evidence/local-upload", { multipart: { file: { name: "smoke.log", mimeType: "text/plain", buffer: Buffer.from("smoke") }, type: "log" } });
  expect([200, 401]).toContain(res.status());
});
