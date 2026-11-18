import { expect, test } from "@playwright/test";

test("the login page renders the console entry point", async ({ page }) => {
	await page.goto("/en/login");
	await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
	await expect(page.getByLabel("Email")).toBeVisible();
	await expect(page.getByLabel("Password")).toBeVisible();
	await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("the privacy notice is reachable without a session", async ({ page }) => {
	await page.goto("/en/privacy");
	await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
});
