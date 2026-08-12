import { expect, test } from "@playwright/test";

const WALLET = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";

async function authenticate(page) {
  await page.addInitScript(({ wallet }) => {
    window.localStorage.setItem("token", "requirements-test-token");
    window.localStorage.setItem("walletConnected_u1", "1");
    window.localStorage.setItem("walletAddress_u1", wallet);
  }, { wallet: WALLET });
}

async function mockApi(page, { transactions = [] } = {}) {
  const requests = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({ method: request.method(), path: `${url.pathname}${url.search}` });
    const json = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/me") return json({ user: { id: "u1", username: "Alex", wallet: { linked: true, address: WALLET } } });
    if (url.pathname === "/api/friends") return json({ friends: [] });
    if (url.pathname === "/api/users/search") return json({ users: [{ id: "u2", username: "recipient", displayName: "Recipient", walletAddress: RECIPIENT }] });
    if (url.pathname === "/api/transactions/balance") return json({ balance: 1.25, assetSymbol: "ETH", currency: "ETH", nativeCurrency: "ETH", balances: { ETH: 1.25, BNB: 10 }, availableCurrencies: ["ETH", "BNB"], fiatEquivalentUsd: 3125 });
    if (url.pathname === "/api/transactions/my") return json({ transactions, total: transactions.length });
    if (url.pathname === "/api/transactions/send-code") return json({ destination: "alex@example.com" });
    if (url.pathname === "/api/transactions/send") return json({ transaction: { id: "tx-1", status: "pending" } });
    if (url.pathname === "/api/wallet/link" && request.method() === "DELETE") return json({ message: "Wallet unlinked" });
    return json({});
  });
  return requests;
}

test("dashboard shows ETH, configurable fiat value, and complete recent history", async ({ page }) => {
  await authenticate(page);
  await mockApi(page, { transactions: [{ id: "tx-1", direction: "received", amount: 0.5, assetSymbol: "ETH", status: "success", senderWallet: RECIPIENT, createdAt: "2026-08-12T10:00:00.000Z" }] });
  await page.goto("/dashboard");
  await expect(page.getByText("ETH balance: 1.2500 ETH")).toBeVisible();
  await expect(page.getByText("Fiat equivalent: ~ 3125.00 USD")).toBeVisible();
  await expect(page.getByText("Received 0.5 ETH")).toBeVisible();
  await expect(page.getByText("success", { exact: true })).toBeVisible();
});

test("transaction history applies date, direction, and status filters", async ({ page }) => {
  await authenticate(page);
  const requests = await mockApi(page, { transactions: [{ id: "tx-1", direction: "sent", amount: 1, assetSymbol: "ETH", status: "failed", receiverWallet: RECIPIENT, createdAt: "2026-08-12T10:00:00.000Z" }] });
  await page.goto("/transactions");
  await page.locator("select").nth(0).selectOption("failed");
  await page.locator("select").nth(1).selectOption("sent");
  await page.locator('input[type="date"]').nth(0).fill("2026-08-01");
  await page.locator('input[type="date"]').nth(1).fill("2026-08-12");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Sent 1 ETH")).toBeVisible();
  await expect.poll(() => requests.some(({ path }) => path.includes("status=failed") && path.includes("view=sent") && path.includes("from=2026-08-01") && path.includes("to=2026-08-12"))).toBe(true);
});

test("valid-address transfer shows a summary and cancelling does not submit it", async ({ page }) => {
  await authenticate(page);
  const requests = await mockApi(page);
  await page.goto("/send");
  await page.getByRole("button", { name: "Address" }).click();
  await page.getByPlaceholder("0x...").fill(RECIPIENT);
  await page.getByPlaceholder(/0\.00 ETH/).fill("1");
  await page.getByRole("button", { name: "Continue to verification" }).click();
  await expect(page.getByText("Transaction summary")).toBeVisible();
  await expect(page.getByText("Total amount")).toBeVisible();
  await expect(page.getByText("1 ETH", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel transfer" }).click();
  await expect(page.getByText("Transaction summary")).not.toBeVisible();
  expect(requests.some(({ path }) => path === "/api/transactions/send")).toBe(false);
});

test("a linked wallet can be disconnected without removing account access", async ({ page }) => {
  await authenticate(page);
  await mockApi(page);
  await page.goto("/account");
  await expect(page.getByText("Linked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unlink wallet" }).click();
  await expect(page.getByText("Not linked", { exact: true })).toBeVisible();
  await expect(page.getByText("Link your account to enable crypto transfers and top-ups.")).toBeVisible();
});
