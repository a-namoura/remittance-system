import { expect, test } from "@playwright/test";

const SLA_MS = 2_000;
const WALLET = "0x1111111111111111111111111111111111111111";

async function expectNotificationWithinSla(page, responseAt, text) {
  await expect(page.locator(".app-success-transition").getByText(text, { exact: false })).toBeVisible({ timeout: SLA_MS });
  expect(responseAt()).toBeGreaterThan(0);
  expect(Date.now() - responseAt()).toBeLessThanOrEqual(SLA_MS);
}

function json(route, status, body, onResponse) {
  onResponse?.();
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function submitLogin(page, routeResponse, expectedMessage) {
  let responseAt = 0;
  await page.route("**/api/auth/login/options", (route) => {
    if (routeResponse.status >= 400) {
      return json(route, routeResponse.status, routeResponse.body, () => {
        responseAt = Date.now();
      });
    }
    return json(route, 200, { channels: { email: true, phone: false } });
  });
  await page.route("**/api/auth/login", (route) =>
    json(route, 200, { token: "test-token" })
  );
  await page.route("**/api/auth/verify-code", (route) =>
    json(route, 200, {}, () => {
      responseAt = Date.now();
    })
  );
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com or username").fill("alex@example.com");
  await page.getByPlaceholder("********").fill("Password1!");
  await page.getByRole("button", { name: "Continue" }).click();
  if (routeResponse.status < 400) {
    await page.getByRole("button", { name: "Send verification code" }).click();
    await page.getByPlaceholder("******").fill("123456");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await expectNotificationWithinSla(page, () => responseAt, expectedMessage);
}

async function completeRegistration(page, routeResponse) {
  let responseAt = 0;
  await page.route("**/api/auth/register/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/send-code")) return json(route, 200, {});
    if (path.endsWith("/verify-code")) return json(route, 200, {});
    if (path.endsWith("/log-phone-code")) return json(route, 200, {});
    return route.fallback();
  });
  await page.route("**/api/auth/register", (route) =>
    json(route, routeResponse.status, routeResponse.body, () => {
      responseAt = Date.now();
    })
  );
  await page.goto("/register");
  await page.getByPlaceholder("you@example.com").fill("alex@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByPlaceholder("******").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await page.getByPlaceholder("********").fill("Password1!");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Can't use your phone number? Skip for now" }).click();
  await page.locator('input[autocomplete="given-name"]').fill("Alex");
  await page.locator('input[autocomplete="family-name"]').fill("Doe");
  await page.getByPlaceholder("yourname").fill("alexdoe");
  await page.locator('input[type="date"]').fill("1990-01-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("select").nth(0).selectOption("employed");
  await page.locator("select").nth(1).selectOption("salary_employment");
  await page.locator("select").nth(2).selectOption("0_500");
  await page.locator('input[type="checkbox"]').nth(0).check();
  await page.locator('input[type="checkbox"]').nth(1).check();
  await page.getByRole("button", { name: "Create account" }).click();
  return () => responseAt;
}

async function resetPassword(page, routeResponse) {
  let responseAt = 0;
  await page.route("**/api/auth/forgot-password/reset", (route) =>
    json(route, routeResponse.status, routeResponse.body, () => {
      responseAt = Date.now();
    })
  );
  await page.goto("/forgot-password?resetToken=reset-token");
  await page.getByPlaceholder("********").nth(0).fill("Password1!");
  await page.getByPlaceholder("********").nth(1).fill("Password1!");
  await page.getByRole("button", { name: "Update password" }).click();
  return () => responseAt;
}

async function mockWalletProvider(page) {
  await page.addInitScript(({ wallet }) => {
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method }) => {
        if (["eth_accounts", "eth_requestAccounts"].includes(method)) return [wallet];
        if (method === "eth_chainId") return "0x1";
        if (method === "personal_sign") return `0x${"11".repeat(65)}`;
        throw new Error(`Unsupported wallet method: ${method}`);
      },
      on: () => {},
      removeListener: () => {},
    };
    window.localStorage.setItem("token", "notification-test-token");
  }, { wallet: WALLET });
}

async function connectWallet(page, routeResponse) {
  let responseAt = 0;
  await mockWalletProvider(page);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return json(route, 200, { user: { id: "u1", wallet: { linked: false } } });
    if (path === "/api/wallet/challenge") return json(route, 200, { message: "Link wallet", challengeId: "challenge-1" });
    if (path === "/api/wallet/link") return json(route, routeResponse.status, routeResponse.body, () => {
      responseAt = Date.now();
    });
    if (path === "/api/transactions/balance") return json(route, 200, { balances: { BNB: 0 } });
    return json(route, 200, {});
  });
  await page.goto("/account");
  await page.getByRole("button", { name: "Connect & Verify Wallet" }).click();
  return () => responseAt;
}

test.describe("backend-result notification SLA", () => {
  test("login success notification appears within 2 seconds", async ({ page }) => {
    await submitLogin(page, { status: 200, body: {} }, "Login successful");
  });

  test("login failure notification includes the backend reason within 2 seconds", async ({ page }) => {
    await submitLogin(page, { status: 401, body: { message: "Invalid credentials" } }, "Invalid credentials");
  });

  test("registration success notification appears within 2 seconds", async ({ page }) => {
    const responseAt = await completeRegistration(page, { status: 201, body: { token: "test-token" } });
    await expectNotificationWithinSla(page, responseAt, "Registration successful");
  });

  test("registration failure notification includes the backend reason within 2 seconds", async ({ page }) => {
    const responseAt = await completeRegistration(page, { status: 409, body: { message: "Email address is already registered" } });
    await expectNotificationWithinSla(page, responseAt, "Email address is already registered");
  });

  test("password reset success notification appears within 2 seconds", async ({ page }) => {
    const responseAt = await resetPassword(page, { status: 200, body: {} });
    await expectNotificationWithinSla(page, responseAt, "Password reset successful");
  });

  test("password reset failure notification includes the backend reason within 2 seconds", async ({ page }) => {
    const responseAt = await resetPassword(page, { status: 400, body: { message: "Reset link has expired" } });
    await expectNotificationWithinSla(page, responseAt, "Reset link has expired");
  });

  test("wallet connection success notification appears within 2 seconds", async ({ page }) => {
    const responseAt = await connectWallet(page, { status: 200, body: { message: "Wallet linked" } });
    await expectNotificationWithinSla(page, responseAt, "Wallet connected successfully");
  });

  test("wallet connection failure notification includes the backend reason within 2 seconds", async ({ page }) => {
    const responseAt = await connectWallet(page, { status: 409, body: { message: "Wallet is linked to another account" } });
    await expectNotificationWithinSla(page, responseAt, "Wallet is linked to another account");
  });
});
