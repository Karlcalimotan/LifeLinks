#!/usr/bin/env node
/*
  Statically verify the Vercel deployment policy.

    node scripts/deployment-check.mjs

  What this proves:
    - both vercel.json files allow only main and staging
    - the negative glob actually matches branches that contain a slash
    - the build command is the repository build
    - no repository workflow or script contains a CLI/API deploy pathway

  What this cannot prove:
    - the Vercel project's production branch
    - the dashboard's preview-deployment setting
    - the absence of deploy hooks created in the Vercel dashboard
  Those remain manual checks. See docs/deployment.md.
*/
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

if (typeof path.matchesGlob !== "function") {
	console.error("deployment-check: Node 22.5 or newer is required for path.matchesGlob");
	process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, "..");
const ALLOWED = new Map([
	["**", false],
	["main", true],
	["staging", true],
]);
const failures = [];
function fail(message) {
	failures.push(message);
}
function read(file) {
	return fs.readFileSync(path.join(ROOT, file), "utf8");
}
function readJson(file) {
	return JSON.parse(read(file));
}
function sameAllowlist(actual) {
	if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
	const keys = Object.keys(actual).sort();
	const expected = [...ALLOWED.keys()].sort();
	if (keys.join(",") !== expected.join(",")) return false;
	return keys.every((key) => actual[key] === ALLOWED.get(key));
}

const negativePatterns = [...ALLOWED.entries()]
	.filter(([, enabled]) => !enabled)
	.map(([pattern]) => pattern);
if (negativePatterns.length !== 1) {
	fail(`allowlist must contain exactly one negative pattern, found ${negativePatterns.length}`);
}
for (const pattern of negativePatterns) {
	for (const branch of ["setup/agent-foundation", "policy/strict-deployment"]) {
		if (!path.matchesGlob(branch, pattern)) {
			fail(
				`negative allowlist pattern "${pattern}" does not match "${branch}"; Vercel would deploy it`,
			);
		}
	}
}

for (const file of ["vercel.json", "apps/web/vercel.json"]) {
	if (!fs.existsSync(path.join(ROOT, file))) {
		fail(`${file} is missing`);
		continue;
	}
	let config;
	try {
		config = readJson(file);
	} catch (error) {
		fail(`${file} is not valid JSON: ${error.message}`);
		continue;
	}
	if (!sameAllowlist(config?.git?.deploymentEnabled)) {
		fail(`${file} must enable deployments only for main and staging`);
	}
	if (config.buildCommand !== "pnpm build") {
		fail(`${file} buildCommand must be "pnpm build"`);
	}
}

const rootConfig = readJson("vercel.json");
const webConfig = readJson("apps/web/vercel.json");
if (JSON.stringify(rootConfig) !== JSON.stringify(webConfig)) {
	fail("root vercel.json and apps/web/vercel.json must stay identical");
}

const gitignore = read(".gitignore");
if (!/^\.vercel\/?$/m.test(gitignore)) {
	fail(".gitignore must ignore the local .vercel directory");
}

const forbidden = [
	/\bvercel\s+deploy\b/,
	/\bvercel\s+--prod\b/,
	/\bvercel\s+promote\b/,
	/\bvercel\s+redeploy\b/,
	/\bvercel\s+rollback\b/,
	/\bnpx\s+vercel\b/,
	/\bdeploy[-_ ]?hook\b/i,
	/\bVERCEL_DEPLOY_HOOK\b/,
	/\bapi\.vercel\.com\/v1\/integrations\/deploy\b/,
];

const scanRoots = [
	".github/workflows",
	"scripts",
	"package.json",
	"vercel.json",
	"apps/web/vercel.json",
];

function walk(target) {
	const absolute = path.join(ROOT, target);
	if (!fs.existsSync(absolute)) return [];
	const stat = fs.statSync(absolute);
	if (stat.isFile()) return [target];
	return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
		const child = path.join(target, entry.name);
		return entry.isDirectory() ? walk(child) : [child];
	});
}

const files = scanRoots
	.flatMap(walk)
	.filter((file) => /\.(mjs|js|ts|sh|ya?ml|json)$/.test(file))
	.filter((file) => file !== "scripts/deployment-check.mjs");

for (const file of files) {
	const lines = read(file).split(/\r?\n/);
	for (const [index, line] of lines.entries()) {
		for (const pattern of forbidden) {
			if (pattern.test(line)) {
				fail(`${file}:${index + 1} contains a prohibited deployment pathway: ${line.trim()}`);
			}
		}
	}
}

if (process.env.GITHUB_REPOSITORY && process.env.GH_TOKEN) {
	try {
		const branch = execFileSync(
			"gh",
			["api", `repos/${process.env.GITHUB_REPOSITORY}`, "--jq", ".default_branch"],
			{ cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		).trim();
		if (branch !== "main") fail(`repository default branch is ${branch}, expected main`);
	} catch (error) {
		fail(`cannot verify the repository default branch: ${error.message}`);
	}
}

if (failures.length > 0) {
	console.error("deployment-check: FAILED");
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log("deployment-check: PASS");
console.log(
	"  verified: **:false covers slash branches, main/staging allowlist, build command, no CLI/API deploy pathways",
);
console.log("  manual: Vercel production branch, preview settings and dashboard deploy hooks");
