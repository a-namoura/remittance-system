import { expect, test } from "@playwright/test";

const SLA_MS = 2_000;
const WALLET = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";

async function authenticate(page) {
  await page.addInitScript(({ wallet }) => {
    window.localStorage.setItem("token", "performance-test-token");
    window.localStorage.setItem("walletConnected_u1", "1");
    window.localStorage.setItem("walletAddress_u1", wallet);
  }, { wallet: WALLET });
}

async function mockApi(page, { terminalStatus = "success", failureReason = "" } = {}) {
  let backendResultAt = 0;
  let sendRequests = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/me") return respond({ user: { id: "u1", username: "Alex", displayName: "Alex", wallet: { linked: true, address: WALLET } } });
    if (path === "/api/friends") return respond({ friends: [] });
    if (path === "/api/users/search") return respond({ users: [] });
    if (path === "/api/transactions/balance") return respond({ balance: 10, assetSymbol: "BNB" });
    if (path === "/api/transactions/my") return respond({ transactions: [], total: 0 });
    if (path === "/api/transactions/send-code") return respond({ destination: "alex@example.com" });
    if (path === "/api/transactions/send") {
      sendRequests += 1;
      return respond({ transaction: { id: "tx-1", status: "pending" } });
    }
    if (path === "/api/transactions/tx-1") {
      backendResultAt = Date.now();
      return respond({ transaction: { id: "tx-1", status: terminalStatus, txHash: "0xresult", failureReason } });
    }
    return respond({});
  });
  return { backendResultAt: () => backendResultAt, sendRequests: () => sendRequests };
}

async function submitMockedTransfer(page) {
  await page.goto("/send");
  await page.getByRole("button", { name: "Address" }).click();
  await page.getByPlaceholder("0x...").fill(RECIPIENT);
  await page.getByPlaceholder(/0\.00 BNB/).fill("1");
  await page.getByRole("button", { name: "Continue to verification" }).click();
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Code sent to", { exact: false })).toBeVisible();
  await page.getByPlaceholder("6 digits").fill("123456");
  await page.getByRole("button", { name: "Confirm and send" }).click();
}

test("key pages load within 2 seconds on average", async ({ page }) => {
  await mockApi(page);
  const durations = [];
  const startedAt = Date.now();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible({ timeout: SLA_MS });
  durations.push(Date.now() - startedAt);
  await authenticate(page);
  for (const [path, heading] of [["/dashboard", "Welcome, Alex"], ["/transactions", "Activity"]]) {
    const pageStartedAt = Date.now();
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: SLA_MS });
    durations.push(Date.now() - pageStartedAt);
  }
  expect(durations.reduce((sum, value) => sum + value, 0) / durations.length).toBeLessThanOrEqual(SLA_MS);
});

test("full mocked /transactions/send flow validates input and submits within 2 seconds excluding confirmation", async ({ page }) => {
  await authenticate(page);
  const api = await mockApi(page);
  await page.goto("/send");
  await page.getByRole("button", { name: "Address" }).click();
  await page.getByPlaceholder("0x...").fill("not-a-wallet");
  await page.getByPlaceholder(/0\.00 BNB/).fill("1");
  await page.getByRole("button", { name: "Continue to verification" }).click();
  await expect(page.getByText("Enter a valid destination wallet address.")).toBeVisible();
  expect(api.sendRequests()).toBe(0);

  await page.getByPlaceholder("0x...").fill(RECIPIENT);
  const startedAt = Date.now();
  await page.getByRole("button", { name: "Continue to verification" }).click();
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByPlaceholder("6 digits").fill("123456");
  await page.getByRole("button", { name: "Confirm and send" }).click();
  await expect(page.getByText("Transfer submitted. Waiting for confirmation...", { exact: false })).toBeVisible({ timeout: SLA_MS });
  expect(api.sendRequests()).toBe(1);
  expect(Date.now() - startedAt).toBeLessThanOrEqual(SLA_MS);
});

test("terminal transaction result reaches the UI within 2 seconds of the backend result", async ({ page }) => {
  await authenticate(page);
  const api = await mockApi(page);
  await submitMockedTransfer(page);
  await expect(page.locator(".app-success-transition")).toContainText("Transfer confirmed.", { timeout: SLA_MS });
  expect(api.backendResultAt()).toBeGreaterThan(0);
  expect(Date.now() - api.backendResultAt()).toBeLessThanOrEqual(SLA_MS);
});

test("terminal transaction failure reason is shown in the UI within 2 seconds", async ({ page }) => {
  await authenticate(page);
  const api = await mockApi(page, { terminalStatus: "failed", failureReason: "Insufficient network fee." });
  await submitMockedTransfer(page);
  await expect(page.locator(".app-success-transition")).toContainText("Insufficient network fee.", { timeout: SLA_MS });
  expect(api.backendResultAt()).toBeGreaterThan(0);
  expect(Date.now() - api.backendResultAt()).toBeLessThanOrEqual(SLA_MS);
});
