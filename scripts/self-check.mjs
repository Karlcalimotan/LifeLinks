#!/usr/bin/env node
/**
 * Local gate: static checks, lint, typecheck, unit tests and (optionally) build.
 *
 *   pnpm self-check
 *   pnpm self-check --quick
 *
 * The build needs a DATABASE_URL and AUTH_SECRET only to load the schema; the
 * pages are dynamic and do not query the database during the build. Dummy values
 * are used when the environment does not provide them, and they are never
 * written to disk.
 */
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");

const baseEnv = {
	...process.env,
	DATABASE_URL:
		process.env.DATABASE_URL ??
		"postgresql://lifelink:lifelink@localhost:5432/lifelink?schema=public",
	DIRECT_URL:
		process.env.DIRECT_URL ??
		"postgresql://lifelink:lifelink@localhost:5432/lifelink?schema=public",
	AUTH_SECRET: process.env.AUTH_SECRET ?? "self-check-only-secret-0123456789",
	NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
	NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

const steps = [
	{ label: "Stack contract", command: process.execPath, args: ["stack/src/verify.mjs", "--self"] },
	{
		label: "Issue policy tests",
		command: process.execPath,
		args: ["--test", "scripts/issue-policy.test.mjs"],
	},
	{ label: "Release contract", command: process.execPath, args: ["scripts/release-check.mjs"] },
	{ label: "Deployment policy", command: process.execPath, args: ["scripts/deployment-check.mjs"] },
	{ label: "Biome", command: "pnpm", args: ["lint"] },
	{ label: "TypeScript", command: "pnpm", args: ["typecheck"] },
	{ label: "Unit tests", command: "pnpm", args: ["test"] },
];

if (!quick) {
	steps.push({ label: "Production build", command: "pnpm", args: ["build"] });
}

const results = [];
for (const step of steps) {
	process.stdout.write(`\n=== ${step.label} ===\n`);
	const started = Date.now();
	const isWindowsPnpm = process.platform === "win32" && step.command === "pnpm";
	const command = isWindowsPnpm ? (process.env.ComSpec ?? "cmd.exe") : step.command;
	const commandArgs = isWindowsPnpm ? ["/d", "/s", "/c", "pnpm", ...step.args] : step.args;
	const result = spawnSync(command, commandArgs, {
		cwd: process.cwd(),
		env: baseEnv,
		encoding: "utf8",
		stdio: "inherit",
	});
	const passed = (result.status ?? 1) === 0;
	results.push({ label: step.label, passed, ms: Date.now() - started });
	if (!passed) break;
}

console.log("\n=== Summary ===");
for (const result of results) {
	console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.label} (${result.ms} ms)`);
}
if (results.length !== steps.length) {
	console.log(`SKIP  ${steps.length - results.length} step(s) after the failure`);
	process.exit(1);
}
console.log("\nAll checks passed.");
