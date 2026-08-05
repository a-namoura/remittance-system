import { expect, test } from "@playwright/test";

const SLA_MS = 2_000;
const WALLET = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";

test("average login page load is within 2 seconds", async ({ page }) => {
  const loadTimes = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const startedAt = Date.now();
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible({ timeout: SLA_MS });
    loadTimes.push(Date.now() - startedAt);
  }

  const averageMs = loadTimes.reduce((sum, value) => sum + value, 0) / loadTimes.length;
  expect(averageMs).toBeLessThanOrEqual(SLA_MS);
});

test("terminal transaction result reaches the UI within 2 seconds of the backend result", async ({ page }) => {
  let backendResultAt = 0;
  await page.addInitScript(({ wallet }) => {
    window.localStorage.setItem("token", "performance-test-token");
    window.localStorage.setItem("walletConnected_u1", "1");
    window.localStorage.setItem("walletAddress_u1", wallet);
  }, { wallet: WALLET });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const respond = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/friends") return respond({ friends: [] });
    if (path === "/api/me") return respond({ user: { id: "u1", wallet: { linked: true, address: WALLET } } });
    if (path === "/api/transactions/balance") return respond({ balance: 10, assetSymbol: "BNB" });
    if (path === "/api/users/search") return respond({ users: [] });
    if (path === "/api/transactions/send-code") return respond({ destination: "alex@example.com" });
    if (path === "/api/transactions/send") return respond({ transaction: { id: "tx-1", status: "pending" } });
    if (path === "/api/transactions/tx-1") {
      backendResultAt = Date.now();
      return respond({ transaction: { id: "tx-1", status: "success", txHash: "0xresult" } });
    }
    return respond({});
  });

  await page.goto("/send");
  await page.getByRole("button", { name: "Address" }).click();
  await page.getByPlaceholder("0x...").fill(RECIPIENT);
  await page.getByPlaceholder(/0\.00 BNB/).fill("1");
  await page.getByRole("button", { name: "Continue to verification" }).click();
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Code sent to", { exact: false })).toBeVisible();
  await page.getByPlaceholder("6 digits").fill("123456");
  await page.getByRole("button", { name: "Confirm and send" }).click();

  await expect(page.locator(".app-success-transition")).toContainText("Transfer confirmed.", { timeout: SLA_MS });
  expect(backendResultAt).toBeGreaterThan(0);
  expect(Date.now() - backendResultAt).toBeLessThanOrEqual(SLA_MS);
});
