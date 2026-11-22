#!/usr/bin/env node
/*
  Enforce the version contract for this repository.

    node scripts/release-check.mjs                 # development consistency
    node scripts/release-check.mjs --require-release
    node scripts/release-check.mjs --tag v0.2.0

  This is a static check. It does not create tags, publish releases or deploy.
*/
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const requireRelease = args.includes("--require-release");
const tagIndex = args.indexOf("--tag");
const tag = tagIndex >= 0 ? args[tagIndex + 1] : null;

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

const SEMVER =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

if (tagIndex >= 0 && !tag) fail("--tag requires a value, for example --tag v0.2.0");

const rootPackage = readJson("package.json");
const webPackage = readJson("apps/web/package.json");
const version = rootPackage.version;

if (!version || !SEMVER.test(version)) {
	fail(`package.json version is not valid SemVer: ${version}`);
}
if (webPackage.version !== version) {
	fail(`apps/web/package.json version ${webPackage.version} does not match root ${version}`);
}

// Firmware versions independently from the application/PWA. The two firmware
// sources must agree with each other, not with package.json.
const platformio = read("firmware/platformio.ini");
const firmwareBuild = platformio.match(/-DFW_VERSION=\\?"([^"\\]+)\\?"/);
if (!firmwareBuild) {
	fail("firmware/platformio.ini does not define FW_VERSION");
} else if (!SEMVER.test(firmwareBuild[1])) {
	fail(`firmware/platformio.ini FW_VERSION is not valid SemVer: ${firmwareBuild[1]}`);
}

const mainIno = read("firmware/main/main.ino");
const firmwareDefault = mainIno.match(/#define FW_VERSION "([^"]+)"/);
if (!firmwareDefault) {
	fail("firmware/main/main.ino does not define a default FW_VERSION");
} else if (!SEMVER.test(firmwareDefault[1])) {
	fail(`firmware/main/main.ino FW_VERSION is not valid SemVer: ${firmwareDefault[1]}`);
}

const firmwareVersion = firmwareBuild?.[1] ?? firmwareDefault?.[1] ?? "unknown";
if (firmwareBuild && firmwareDefault && firmwareBuild[1] !== firmwareDefault[1]) {
	fail(
		`firmware versions disagree: platformio.ini ${firmwareBuild[1]} vs main.ino ${firmwareDefault[1]}`,
	);
}

const changelog = read("CHANGELOG.md");
if (!changelog.includes("## [Unreleased]")) fail("CHANGELOG.md is missing ## [Unreleased]");

const releaseHeadings = [...changelog.matchAll(/^## \[([^\]]+)\](.*)$/gm)].filter(
	(match) => match[1] !== "Unreleased",
);
for (const match of releaseHeadings) {
	if (!/^ - \d{4}-\d{2}-\d{2}$/.test(match[2])) {
		fail(`CHANGELOG.md heading for ${match[1]} must be dated: ## [${match[1]}] - YYYY-MM-DD`);
	}
}

function sectionBody(heading) {
	const start = changelog.indexOf(heading);
	if (start < 0) return null;
	const bodyStart = start + heading.length;
	const next = changelog.indexOf("\n## ", bodyStart);
	return next < 0 ? changelog.slice(bodyStart) : changelog.slice(bodyStart, next);
}

const unreleased = sectionBody("## [Unreleased]");
const currentHeading = `## [${version}]`;
const currentSection = sectionBody(currentHeading);

if (requireRelease) {
	if (currentSection === null) {
		fail(`CHANGELOG.md has no section for the current version ${version}`);
	}
	if (unreleased === null) {
		fail("CHANGELOG.md has no ## [Unreleased] section");
	} else if (unreleased.trim() !== "") {
		fail("CHANGELOG.md [Unreleased] must be empty before a production release");
	}
}

if (tag) {
	const isFirmwareTag = tag.startsWith("fw-v");
	const expectedTag = isFirmwareTag ? `fw-v${firmwareVersion}` : `v${version}`;
	if (tag !== expectedTag) fail(`tag ${tag} does not match ${expectedTag}`);
	if (!isFirmwareTag && currentSection === null) {
		fail(`CHANGELOG.md has no section for ${version}`);
	}
	try {
		const type = execFileSync("git", ["cat-file", "-t", tag], {
			cwd: ROOT,
			encoding: "utf8",
		}).trim();
		if (type !== "tag") {
			fail(`tag ${tag} must be annotated; git cat-file -t returned ${type}`);
		}
		const head = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: ROOT,
			encoding: "utf8",
		}).trim();
		const tagged = execFileSync("git", ["rev-list", "-n", "1", tag], {
			cwd: ROOT,
			encoding: "utf8",
		}).trim();
		if (head !== tagged) fail(`tag ${tag} does not point at HEAD`);
	} catch (error) {
		fail(`cannot inspect tag ${tag}: ${error.message}`);
	}
}

if (failures.length > 0) {
	console.error("release-check: FAILED");
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

const suffix = [tag ? `tag ${tag}` : "", requireRelease ? "release-ready" : ""]
	.filter(Boolean)
	.join(", ");
console.log(
	`release-check: PASS (app ${version}, firmware ${firmwareVersion}${suffix ? `, ${suffix}` : ""})`,
);
