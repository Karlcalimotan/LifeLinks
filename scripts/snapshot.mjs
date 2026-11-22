#!/usr/bin/env node
/**
 * Cycle 0 screenshot baseline.
 *
 *   SNAPSHOT_PAGES=devices node scripts/snapshot.mjs
 *
 * Starts from the running app at E2E_BASE_URL (default http://localhost:3000),
 * signs in with the demo admin, and writes desktop (1440x900) and mobile
 * (390x844) screenshots plus a console-error manifest.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const locale = process.env.SNAPSHOT_LOCALE ?? "en";
const cycle = process.env.SNAPSHOT_CYCLE ?? "cycle-0";
const outDir = process.env.SNAPSHOT_OUT ?? path.resolve(`reports/screens/${cycle}`);
const email = process.env.SNAPSHOT_EMAIL ?? "admin@lifelink.local";
const password = process.env.SNAPSHOT_PASSWORD ?? "Admin123!";
const requested = (process.env.SNAPSHOT_PAGES ?? "login,dashboard,vehicles,incidents,devices,settings")
	.split(",")
	.map((page) => page.trim())
	.filter(Boolean);

const routes = {
	login: "login",
	dashboard: "dashboard",
	vehicles: "vehicles",
	incidents: "incidents",
	devices: "devices",
	settings: "settings",
};

const viewports = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "mobile", width: 390, height: 844 },
];

const manifest = {
	generatedAt: new Date().toISOString(),
	baseURL,
	locale,
	cycle,
	screens: [],
	consoleErrors: [],
};

async function signIn(page) {
	await page.goto(`${baseURL}/${locale}/login`, { waitUntil: "domcontentloaded" });
	await page.fill("#email", email);
	await page.fill("#password", password);
	await Promise.all([
		page.waitForURL(`**/${locale}/dashboard`, { timeout: 45_000 }),
		page.getByRole("button", { name: /sign in/i }).click(),
	]);
}

async function settle(page) {
	await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
	await page.evaluate(() => document.fonts.ready).catch(() => {});
	await page.waitForTimeout(300);
}

async function capture(page, viewport, name, url, fullPage = true) {
	await page.goto(url, { waitUntil: "domcontentloaded" });
	await settle(page);
	const file = path.join(outDir, viewport.name, `${name}.png`);
	await page.screenshot({ path: file, fullPage });
	manifest.screens.push({
		page: name,
		viewport: viewport.name,
		url: page.url(),
		title: await page.title(),
		file: path.relative(process.cwd(), file).replaceAll("\\", "/"),
	});
}

async function main() {
	const browser = await chromium.launch({ headless: true });
	try {
		for (const viewport of viewports) {
			const context = await browser.newContext({
				viewport: { width: viewport.width, height: viewport.height },
				reducedMotion: "reduce",
			});
			const page = await context.newPage();
			page.on("console", (message) => {
				if (message.type() === "error") {
					manifest.consoleErrors.push({ viewport: viewport.name, text: message.text() });
				}
			});
			page.on("pageerror", (error) => {
				manifest.consoleErrors.push({ viewport: viewport.name, text: error.message });
			});

			await mkdir(path.join(outDir, viewport.name), { recursive: true });

			if (requested.includes("login")) {
				await capture(page, viewport, "login", `${baseURL}/${locale}/login`);
			}
			await signIn(page);

			for (const name of requested) {
				if (name === "login") continue;
				const route = routes[name];
				if (!route) continue;
				await capture(page, viewport, name, `${baseURL}/${locale}/${route}`);
				if (name === "devices") {
					await page.getByRole("button", { name: /register tracker/i }).click();
					await page.waitForTimeout(250);
					const drawerFile = path.join(outDir, viewport.name, "devices-drawer.png");
					await page.screenshot({ path: drawerFile, fullPage: false });
					manifest.screens.push({
						page: "devices-drawer",
						viewport: viewport.name,
						url: page.url(),
						title: await page.title(),
						file: path.relative(process.cwd(), drawerFile).replaceAll("\\", "/"),
					});
				}
			}
			await context.close();
		}
	} finally {
		await browser.close();
	}

	await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	console.log(`Wrote ${manifest.screens.length} screenshots to ${outDir}`);
	if (manifest.consoleErrors.length > 0) {
		console.log(`Console errors: ${manifest.consoleErrors.length} (see manifest.json)`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
