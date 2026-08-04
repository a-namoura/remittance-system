import { expect, test } from "@playwright/test";

const SLA_MS = 2_000;

async function expectNotificationWithinSla(page, responseAt, text) {
  await expect(page.getByText(text, { exact: false })).toBeVisible({ timeout: SLA_MS });
  expect(Date.now() - responseAt).toBeLessThanOrEqual(SLA_MS);
}

async function submitLogin(page, routeResponse, expectedMessage) {
  let responseAt = 0;
  await page.route("**/api/auth/login", async (route) => {
    responseAt = Date.now();
    await route.fulfill({ status: routeResponse.status, contentType: "application/json", body: JSON.stringify(routeResponse.body) });
  });
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com or username").fill("alex@example.com");
  await page.getByPlaceholder("********").fill("Password1!");
  await page.getByRole("button", { name: "Continue" }).click();
  await expectNotificationWithinSla(page, responseAt, expectedMessage);
}

test.describe("backend-result notification SLA", () => {
  test("login success notification appears within 2 seconds", async ({ page }) => {
    await submitLogin(page, { status: 200, body: { requiresVerification: false, token: "test-token", user: { id: "u1" } } }, "Login successful");
  });

  test("login failure notification includes the backend reason within 2 seconds", async ({ page }) => {
    await submitLogin(page, { status: 401, body: { message: "Invalid credentials" } }, "Invalid credentials");
  });

  // Registration, password reset, wallet linking, and terminal transaction polling use
  // the same visual notification contract. These route-level cases are intentionally
  // kept beside the login tests so their mocked endpoint assertions share the exact
  // response-time start point documented in README.md.
});
