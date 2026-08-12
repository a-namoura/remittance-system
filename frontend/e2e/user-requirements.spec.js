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
    if (url.pathname === "/api/transactions/balance") return json({ balance: 1.25, assetSymbol: "BNB", currency: "BNB", nativeCurrency: "BNB", balances: { BNB: 1.25 }, availableCurrencies: ["BNB"], fiatEquivalentUsd: 750 });
    if (url.pathname === "/api/transactions/my") return json({ transactions, total: transactions.length });
    if (url.pathname === "/api/transactions/send-code") return json({ destination: "alex@example.com" });
    if (url.pathname === "/api/transactions/send") return json({ transaction: { id: "tx-1", status: "pending" } });
    if (url.pathname === "/api/wallet/link" && request.method() === "DELETE") return json({ message: "Wallet unlinked" });
    return json({});
  });
  return requests;
}

async function mockUnlinkedAccount(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname === "/api/me"
      ? { user: { id: "u1", username: "Alex", wallet: { linked: false } } }
      : {};
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.addInitScript(() => window.localStorage.setItem("token", "requirements-test-token"));
}

function installWalletProvider(page, mode) {
  return page.addInitScript(({ wallet, providerMode }) => {
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method }) => {
        if (method === "eth_chainId") return "0x61";
        if (method === "eth_accounts") return [];
        if (method === "eth_requestAccounts" && providerMode === "rejected") {
          throw Object.assign(new Error("User rejected"), { code: 4001 });
        }
        if (method === "eth_requestAccounts" && providerMode === "empty") return [];
        return [wallet];
      },
      on: () => {},
      removeListener: () => {},
    };
  }, { wallet: WALLET, providerMode: mode });
}

test("password recovery verifies account ownership before accepting a new password", async ({ page }) => {
  const calls = [];
  await page.route("**/api/auth/forgot-password/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push({ path: url.pathname, body: route.request().postDataJSON() });
    const responses = {
      "/api/auth/forgot-password/options": { channels: { email: true, phone: true } },
      "/api/auth/forgot-password/start": { token: "ownership-session", destination: "+1***99", verificationChannel: "phone" },
      "/api/auth/forgot-password/verify": { resetToken: "verified-reset-token" },
      "/api/auth/forgot-password/reset": { message: "Password updated successfully." },
    };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(responses[url.pathname]) });
  });
  await page.goto("/forgot-password");
  await page.getByPlaceholder("username / you@example.com / +123...").fill("alex@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Phone number" }).click();
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.getByRole("button", { name: "Update password" })).not.toBeVisible();
  await page.getByPlaceholder("******").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await page.getByPlaceholder("********").nth(0).fill("Password1!");
  await page.getByPlaceholder("********").nth(1).fill("Password1!");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect.poll(() => calls.map(({ path }) => path)).toEqual([
    "/api/auth/forgot-password/options",
    "/api/auth/forgot-password/start",
    "/api/auth/forgot-password/verify",
    "/api/auth/forgot-password/reset",
  ]);
  expect(calls[2].body).toEqual({ token: "ownership-session", code: "123456" });
  expect(calls[3].body).toEqual({ resetToken: "verified-reset-token", newPassword: "Password1!" });
});

test("wallet UI reports no connection and a missing provider", async ({ page }) => {
  await mockUnlinkedAccount(page);
  await page.goto("/account");
  await expect(page.getByText("Not linked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Connect & Verify Wallet" }).click();
  await expect(page.getByRole("alert").getByText("Wallet provider not found", { exact: false })).toBeVisible();
});

test("wallet UI reports a rejected connection request", async ({ page }) => {
  await mockUnlinkedAccount(page);
  await installWalletProvider(page, "rejected");
  await page.goto("/account");
  await page.getByRole("button", { name: "Connect & Verify Wallet" }).click();
  await expect(page.getByRole("alert").getByText("Wallet connection request was rejected", { exact: false })).toBeVisible();
});

test("wallet UI reports a failed connection when no account is returned", async ({ page }) => {
  await mockUnlinkedAccount(page);
  await installWalletProvider(page, "empty");
  await page.goto("/account");
  await page.getByRole("button", { name: "Connect & Verify Wallet" }).click();
  await expect(page.getByRole("alert").getByText("Wallet connection failed. No account was returned", { exact: false })).toBeVisible();
});

test("dashboard shows native BNB balance and configurable fiat value", async ({ page }) => {
  await authenticate(page);
  await mockApi(page);
  await page.goto("/dashboard");
  await expect(page.getByText("BNB balance: 1.2500 BNB")).toBeVisible();
  await expect(page.getByText("Fiat equivalent: ~ 750.00 USD")).toBeVisible();
});

test("complete transaction history displays every returned record", async ({ page }) => {
  await authenticate(page);
  await mockApi(page, { transactions: [
    { id: "tx-1", direction: "received", amount: 0.5, assetSymbol: "BNB", status: "success", senderWallet: RECIPIENT, createdAt: "2026-08-12T10:00:00.000Z" },
    { id: "tx-2", direction: "sent", amount: 0.25, assetSymbol: "BNB", status: "pending", receiverWallet: RECIPIENT, createdAt: "2026-08-11T10:00:00.000Z" },
    { id: "tx-3", direction: "sent", amount: 0.1, assetSymbol: "BNB", status: "failed", receiverWallet: RECIPIENT, createdAt: "2026-08-10T10:00:00.000Z" },
  ] });
  await page.goto("/transactions");
  await expect(page.getByText("Received 0.5 BNB")).toBeVisible();
  await expect(page.getByText("Sent 0.25 BNB")).toBeVisible();
  await expect(page.getByText("Sent 0.1 BNB")).toBeVisible();
  await expect(page.getByText("3 transactions", { exact: false })).toBeVisible();
});

test("transaction history applies date, direction, and status filters", async ({ page }) => {
  await authenticate(page);
  const requests = await mockApi(page, { transactions: [{ id: "tx-1", direction: "sent", amount: 1, assetSymbol: "BNB", status: "failed", receiverWallet: RECIPIENT, createdAt: "2026-08-12T10:00:00.000Z" }] });
  await page.goto("/transactions");
  await page.locator("select").nth(0).selectOption("failed");
  await page.locator("select").nth(1).selectOption("sent");
  await page.locator('input[type="date"]').nth(0).fill("2026-08-01");
  await page.locator('input[type="date"]').nth(1).fill("2026-08-12");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Sent 1 BNB")).toBeVisible();
  await expect.poll(() => requests.some(({ path }) => path.includes("status=failed") && path.includes("view=sent") && path.includes("from=2026-08-01") && path.includes("to=2026-08-12"))).toBe(true);
});

test("registered-user recipient and amount appear in summary before cancellation", async ({ page }) => {
  await authenticate(page);
  const requests = await mockApi(page);
  await page.goto("/send");
  await page.getByPlaceholder("Search recipient").fill("recipient");
  await expect(page.getByText("@recipient", { exact: true })).toBeVisible();
  await page.getByText("@recipient", { exact: true }).click();
  await page.getByRole("button", { name: "Address" }).click();
  await page.getByPlaceholder(/0\.00 BNB/).fill("1");
  await page.getByRole("button", { name: "Continue to verification" }).click();
  await expect(page.getByText("Transaction summary")).toBeVisible();
  await expect(page.getByText("Recipient", { exact: true })).toBeVisible();
  await expect(page.getByText(RECIPIENT, { exact: true })).toBeVisible();
  await expect(page.getByText("Total amount")).toBeVisible();
  await expect(page.getByText("1 BNB", { exact: true })).toBeVisible();
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
