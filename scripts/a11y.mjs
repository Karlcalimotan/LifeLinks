#!/usr/bin/env node
/**
 * Repeatable axe accessibility gate.
 *
 *   node scripts/a11y.mjs
 *   pnpm a11y
 *   E2E_BASE_URL=http://localhost:3001 node scripts/a11y.mjs
 *   A11Y_ROUTES=dashboard,devices A11Y_VIEWPORTS=desktop,mobile node scripts/a11y.mjs
 *
 * The app must already be running at E2E_BASE_URL (default
 * http://localhost:3000). The script signs in with the demo admin, runs axe on
 * the console routes and writes reports/a11y/latest.json plus a Markdown
 * summary. It never prints credentials or session cookies.
 *
 * Exit codes:
 *   0  every route was measured and has no serious or critical violations
 *   1  at least one serious or critical violation was measured
 *   2  not run or incomplete: server unreachable, sign-in failed, or a route
 *      could not be measured. This is not a pass.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import axe from "axe-core";

const baseURL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const locale = process.env.A11Y_LOCALE ?? "en";
const email = process.env.A11Y_EMAIL ?? "admin@lifelink.local";
const password = process.env.A11Y_PASSWORD ?? "Admin123!";
const reportDir = path.resolve(import.meta.dirname, "..", "reports", "a11y");

/** Route labels match the console navigation; paths are the app routes. */
const routeCatalog = [
	{ name: "dashboard", path: "dashboard" },
	{ name: "incidents", path: "incidents" },
	{ name: "map", path: "map" },
	{ name: "analytics", path: "analytics" },
	{ name: "settings", path: "settings" },
	{ name: "trackers", path: "devices" },
	{ name: "vehicles", path: "vehicles" },
	{ name: "notifications", path: "notifications" },
	{ name: "login", path: "login", requiresSession: false },
];

const viewportCatalog = {
	desktop: { width: 1440, height: 900 },
	mobile: { width: 390, height: 844 },
};

function csv(value) {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

const requestedRoutes = new Set(
	csv(process.env.A11Y_ROUTES ?? routeCatalog.map((r) => r.name).join(",")),
);
const requestedViewports = csv(process.env.A11Y_VIEWPORTS ?? "desktop");
const routes = routeCatalog.filter((route) => requestedRoutes.has(route.name));
const invalidViewports = requestedViewports.filter((name) => !viewportCatalog[name]);
const viewports = requestedViewports
	.filter((name) => viewportCatalog[name])
	.map((name) => ({ name, ...viewportCatalog[name] }));

const report = {
	generatedAt: new Date().toISOString(),
	baseURL,
	locale,
	axeVersion: axe.version,
	viewports: viewports.map((viewport) => `${viewport.name} ${viewport.width}x${viewport.height}`),
	gate: "serious and critical violations",
	routes: [],
	errors: [],
};

class NotRunError extends Error {}

function countByImpact(violations) {
	const counts = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
	for (const violation of violations) {
		const key = violation.impact ?? "unknown";
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

function reasonOf(error) {
	const cause = error?.cause;
	if (cause?.code) {
		return `${cause.code}${cause.address ? ` at ${cause.address}:${cause.port}` : ""}`;
	}
	return error instanceof Error ? error.message : String(error);
}

function shorten(text, max = 220) {
	const flat = String(text ?? "")
		.replace(/\s+/g, " ")
		.trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

async function preflight() {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5000);
	try {
		const response = await fetch(`${baseURL}/${locale}/login`, {
			signal: controller.signal,
			redirect: "manual",
		});
		if (response.status >= 400) {
			throw new Error(`HTTP ${response.status} from ${baseURL}/${locale}/login`);
		}
	} catch (error) {
		throw new NotRunError(
			`No LifeLink app answered at ${baseURL}. Start it with "pnpm dev" or set E2E_BASE_URL. ` +
				`Reason: ${reasonOf(error)}`,
		);
	} finally {
		clearTimeout(timer);
	}
}

async function settle(page) {
	await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
	await page.evaluate(() => document.fonts.ready).catch(() => {});
	await page.waitForTimeout(300);
}

async function signIn(page) {
	await page.goto(`${baseURL}/${locale}/login`, { waitUntil: "domcontentloaded" });
	await page.fill("#email", email);
	await page.fill("#password", password);
	await Promise.all([
		page.waitForURL(`**/${locale}/dashboard`, { timeout: 45_000 }),
		page.getByRole("button", { name: /sign in/i }).click(),
	]);
}

async function runAxe(page) {
	await page.addScriptTag({ content: axe.source });
	// axe.run in the page context; all enabled rules, violations only.
	return page.evaluate(async () => {
		const results = await window.axe.run(document, { resultTypes: ["violations"] });
		return {
			violations: results.violations.map((violation) => ({
				id: violation.id,
				impact: violation.impact ?? null,
				help: violation.help,
				helpUrl: violation.helpUrl,
				nodes: violation.nodes.map((node) => ({
					target: node.target,
					html: node.html,
					failureSummary: node.failureSummary,
				})),
			})),
		};
	});
}

async function measure(page, route) {
	const url = `${baseURL}/${locale}/${route.path}`;
	const response = await page.goto(url, { waitUntil: "domcontentloaded" });
	const status = response?.status() ?? 0;
	if (status >= 400) {
		throw new Error(`HTTP ${status} at ${url}`);
	}
	await settle(page);
	const { violations } = await runAxe(page);
	const counts = countByImpact(violations);
	return {
		route: route.name,
		url: page.url(),
		title: await page.title(),
		measured: true,
		counts,
		violations,
	};
}

function notRunRow(viewport, route, reason) {
	report.errors.push(`${viewport.name} ${route.name}: ${reason}`);
	return {
		viewport: viewport.name,
		route: route.name,
		url: `${baseURL}/${locale}/${route.path}`,
		title: "",
		measured: false,
		counts: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
		violations: [],
		reason,
	};
}

async function measureRoute(page, viewport, route) {
	try {
		report.routes.push({ viewport: viewport.name, ...(await measure(page, route)) });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		report.routes.push(notRunRow(viewport, route, message));
	}
}

let signInFailed = false;

async function measureViewport(browser, viewport) {
	const context = await browser.newContext({
		viewport: { width: viewport.width, height: viewport.height },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	try {
		// The login page is measured before authentication; when a session exists
		// the app redirects it to the dashboard.
		if (routes.some((route) => route.name === "login")) {
			await measureRoute(page, viewport, { name: "login", path: "login" });
		}

		const authenticated = routes.filter((route) => route.requiresSession !== false);
		if (authenticated.length > 0) {
			try {
				await signIn(page);
			} catch (error) {
				signInFailed = true;
				const message = error instanceof Error ? error.message : String(error);
				for (const route of authenticated) {
					report.routes.push(notRunRow(viewport, route, `sign-in failed: ${message}`));
				}
				return;
			}
			for (const route of authenticated) {
				await measureRoute(page, viewport, route);
			}
		}
	} finally {
		await context.close();
	}
}

function summarize() {
	const measured = report.routes.filter((route) => route.measured);
	const expected = routes.length * viewports.length;
	const critical = measured.reduce((total, route) => total + route.counts.critical, 0);
	const serious = measured.reduce((total, route) => total + route.counts.serious, 0);
	const moderate = measured.reduce((total, route) => total + route.counts.moderate, 0);
	const minor = measured.reduce((total, route) => total + route.counts.minor, 0);
	let status = "pass";
	if (critical + serious > 0) status = "fail";
	else if (measured.length < expected) status = "incomplete";
	return { status, measured: measured.length, expected, critical, serious, moderate, minor };
}

function renderMarkdown(summary) {
	const lines = [];
	const statusLabel = {
		pass: "PASS — no serious or critical violations",
		fail: "FAIL — serious or critical violations found",
		incomplete: "INCOMPLETE — not every route was measured",
		"not-run": "NOT RUN — the check did not execute",
	}[summary.status];

	lines.push("# Accessibility check (axe)");
	lines.push("");
	lines.push(`Generated: ${report.generatedAt}`);
	lines.push(`Base URL: ${report.baseURL}`);
	lines.push(`Locale: ${report.locale}`);
	lines.push(`axe: ${report.axeVersion}`);
	lines.push(`Viewports: ${report.viewports.join(", ")}`);
	lines.push(`Gate: ${report.gate}`);
	lines.push("");
	lines.push(`**Result: ${statusLabel}**`);
	lines.push("");
	lines.push(`Measured routes: ${summary.measured} of ${summary.expected}.`);
	lines.push("");

	if (report.routes.length > 0) {
		lines.push("| Viewport | Route | Critical | Serious | Moderate | Minor | Result |");
		lines.push("| --- | --- | --- | --- | --- | --- | --- |");
		for (const route of report.routes) {
			const result = route.measured
				? route.counts.critical + route.counts.serious > 0
					? "FAIL"
					: "clean"
				: "NOT RUN";
			lines.push(
				`| ${route.viewport} | ${route.route} | ${route.counts.critical} | ${route.counts.serious} | ` +
					`${route.counts.moderate} | ${route.counts.minor} | ${result} |`,
			);
		}
		lines.push("");
	}

	const blocking = report.routes
		.filter((route) => route.measured)
		.flatMap((route) =>
			route.violations
				.filter((violation) => violation.impact === "serious" || violation.impact === "critical")
				.map((violation) => ({ route: route.route, viewport: route.viewport, violation })),
		);

	if (blocking.length > 0) {
		lines.push("## Serious and critical violations");
		lines.push("");
		for (const { route, viewport, violation } of blocking) {
			lines.push(
				`### ${route} (${viewport}) — ${violation.id} (${violation.impact}) — ${violation.nodes.length} node(s)`,
			);
			lines.push("");
			lines.push(violation.help);
			lines.push("");
			lines.push(violation.helpUrl);
			for (const node of violation.nodes.slice(0, 5)) {
				lines.push(
					`- \`${shorten(node.target.join(" "), 160)}\` — ${shorten(node.failureSummary)}`,
				);
			}
			if (violation.nodes.length > 5) {
				lines.push(`- …and ${violation.nodes.length - 5} more in the JSON report`);
			}
			lines.push("");
		}
	}

	const notable = report.routes
		.filter((route) => route.measured)
		.flatMap((route) =>
			route.violations
				.filter((violation) => violation.impact !== "serious" && violation.impact !== "critical")
				.map((violation) => ({ route: route.route, viewport: route.viewport, violation })),
		);

	if (notable.length > 0) {
		lines.push("## Moderate and minor findings");
		lines.push("");
		for (const { route, viewport, violation } of notable) {
			lines.push(
				`- ${route} (${viewport}): ${violation.id} (${violation.impact ?? "unknown"}) — ` +
					`${violation.nodes.length} node(s)`,
			);
		}
		lines.push("");
	}

	if (report.errors.length > 0) {
		lines.push("## Not run");
		lines.push("");
		for (const error of report.errors) {
			lines.push(`- ${error}`);
		}
		lines.push("");
	}

	lines.push("## How to reproduce");
	lines.push("");
	lines.push("```bash");
	lines.push("pnpm dev            # or another server at E2E_BASE_URL");
	lines.push("pnpm a11y           # node scripts/a11y.mjs");
	lines.push("```");
	lines.push("");
	lines.push(
		"The script signs in with the demo admin and never prints credentials or session cookies. " +
			"`A11Y_ROUTES`, `A11Y_VIEWPORTS` and `A11Y_LOCALE` narrow a run; " +
			"`E2E_BASE_URL` points it at another server.",
	);
	lines.push("");
	return lines.join("\n");
}

async function writeReports(summary) {
	await mkdir(reportDir, { recursive: true });
	report.summary = summary;
	await writeFile(path.join(reportDir, "latest.json"), `${JSON.stringify(report, null, "\t")}\n`);
	await writeFile(path.join(reportDir, "latest.md"), renderMarkdown(summary));
	return reportDir;
}

async function main() {
	if (routes.length === 0) {
		throw new NotRunError("No routes selected. Check A11Y_ROUTES.");
	}
	if (invalidViewports.length > 0) {
		throw new NotRunError(
			`Unknown viewport(s): ${invalidViewports.join(", ")}. Use ${Object.keys(viewportCatalog).join(", ")}.`,
		);
	}
	if (viewports.length === 0) {
		throw new NotRunError("No viewports selected. Check A11Y_VIEWPORTS.");
	}

	await preflight();

	let browser;
	try {
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new NotRunError(
			`Playwright Chromium did not launch. Install it with "pnpm --filter web exec playwright install chromium". Reason: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	try {
		for (const viewport of viewports) {
			try {
				await measureViewport(browser, viewport);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				for (const route of routes) {
					const recorded = report.routes.some(
						(row) => row.viewport === viewport.name && row.route === route.name,
					);
					if (!recorded) report.routes.push(notRunRow(viewport, route, message));
				}
			}
			// A failed sign-in makes every remaining viewport fail the same way and
			// would burn the login rate limit, so stop after the first one.
			if (signInFailed) break;
		}
	} finally {
		await browser.close();
	}

	const summary = summarize();
	const directory = await writeReports(summary);
	const fail = summary.critical + summary.serious;
	const label =
		summary.status === "pass"
			? "PASS — no serious or critical violations"
			: summary.status === "fail"
				? `FAIL — ${summary.critical} critical and ${summary.serious} serious violations`
				: "INCOMPLETE — not every route was measured";

	console.log(`axe ${report.axeVersion} on ${report.baseURL}`);
	console.log(`${label} (${summary.measured}/${summary.expected} routes measured)`);
	console.log(`moderate ${summary.moderate}, minor ${summary.minor}`);
	console.log(`Report: ${path.join(directory, "latest.md")}`);
	for (const error of report.errors) {
		console.error(`Not run: ${error}`);
	}

	if (fail > 0) {
		process.exitCode = 1;
	} else if (summary.measured < summary.expected) {
		process.exitCode = 2;
	}
}

main().catch(async (error) => {
	const message = error instanceof Error ? error.message : String(error);
	const summary = {
		status: "not-run",
		measured: 0,
		expected: routes.length * viewports.length,
		critical: 0,
		serious: 0,
		moderate: 0,
		minor: 0,
	};
	if (report.errors.length === 0) report.errors.push(message);
	try {
		const directory = await writeReports(summary);
		console.error(`NOT RUN — ${message}`);
		console.error(`Report: ${path.join(directory, "latest.md")}`);
	} catch (writeError) {
		console.error(`NOT RUN — ${message}`);
		console.error(
			`Could not write the report: ${writeError instanceof Error ? writeError.message : writeError}`,
		);
	}
	process.exitCode = 2;
});
