#!/usr/bin/env node
/*
  Verify the LifeLink template or a generated project.

    node stack/src/verify.mjs --self
    node stack/src/verify.mjs --target ../MyProject

  The checks are static: required files, forbidden pond/feeding vocabulary, and
  the server/firmware configuration contract. They do not replace `pnpm test`,
  `pnpm build` or the hardware bench tests.
*/
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

const EXCLUDED_DIRS = new Set([
	"node_modules",
	".next",
	".git",
	".pio",
	"coverage",
	"test-results",
	"playwright-report",
	"blob-report",
	"stack",
]);

const TEXT_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".mjs",
	".cjs",
	".json",
	".md",
	".mdx",
	".css",
	".prisma",
	".h",
	".hpp",
	".cpp",
	".ino",
	".ini",
	".yml",
	".yaml",
	".txt",
	".example",
	".svg",
	".sql",
]);

const REQUIRED = [
	"package.json",
	"pnpm-workspace.yaml",
	"apps/web/package.json",
	"apps/web/prisma/schema.prisma",
	"apps/web/lib/firmware/config.ts",
	"apps/web/app/api/device/ingest/route.ts",
	"firmware/platformio.ini",
	"firmware/main/config.h",
	"firmware/main/main.ino",
	"docs/architecture.md",
];

const FORBIDDEN = ["optifeed", "pakaonai", "pond", "fish", "feeder", "feeding", "fcr", "harvest"];

function parseArgs(argv) {
	const args = { self: false, target: null };
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--self") args.self = true;
		else if (token === "--target") {
			const value = argv[index + 1];
			if (!value) throw new Error("--target requires a path");
			args.target = path.resolve(process.cwd(), value);
			index += 1;
		} else if (token === "--help" || token === "-h") {
			console.log("Usage: node stack/src/verify.mjs --self | --target <dir>");
			process.exit(0);
		} else {
			throw new Error(`Unknown argument: ${token}`);
		}
	}
	if (!args.self && !args.target) throw new Error("Pass --self or --target <dir>");
	return args;
}

function isTextFile(filePath) {
	const base = path.basename(filePath);
	if (base === ".gitignore" || base === ".gitattributes" || base === ".npmrc") return true;
	if (base === "Dockerfile" || base === "LICENSE" || base === "VERSION") return true;
	return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function walk(root) {
	const files = [];
	function visit(directory) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			if (EXCLUDED_DIRS.has(entry.name)) continue;
			const full = path.join(directory, entry.name);
			if (entry.isDirectory()) visit(full);
			else if (entry.isFile()) files.push(full);
		}
	}
	visit(root);
	return files;
}

function checkRequired(root, errors) {
	for (const relative of REQUIRED) {
		if (!fs.existsSync(path.join(root, relative))) {
			errors.push(`missing required file: ${relative}`);
		}
	}
}

function checkForbidden(root, errors) {
	const pattern = new RegExp(`\\b(${FORBIDDEN.join("|")})\\b`, "i");
	for (const file of walk(root)) {
		if (!isTextFile(file)) continue;
		if (path.basename(file) === "pnpm-lock.yaml") continue;
		const relative = path.relative(root, file).split(path.sep).join("/");
		if (relative === "LICENSE" || relative === "ATTRIBUTIONS.md") continue;
		const content = fs.readFileSync(file, "utf8");
		const match = pattern.exec(content);
		if (match) {
			const line = content.slice(0, match.index).split("\n").length;
			errors.push(`forbidden template vocabulary "${match[0]}" at ${relative}:${line}`);
		}
	}
}

function parseTypeScriptFields(source) {
	const fields = [];
	const pattern =
		/key:\s*"([^"]+)",\s*firmwareKey:\s*"([^"]+)",\s*min:\s*([\d_.]+),\s*max:\s*([\d_.]+),\s*integer:\s*(true|false),\s*defaultValue:\s*([\d_.]+)/g;
	for (const match of source.matchAll(pattern)) {
		const numeric = (value) => Number(value.replaceAll("_", ""));
		fields.push({
			key: match[1],
			firmwareKey: match[2],
			min: numeric(match[3]),
			max: numeric(match[4]),
			integer: match[5] === "true",
			defaultValue: numeric(match[6]),
		});
	}
	return fields;
}

function parseHeaderFields(source) {
	const fields = [];
	const pattern = /X\((\w+),\s*"([^"]+)",\s*([\d.]+)f,\s*([\d.]+)f,\s*(true|false),\s*([\d.]+)f\)/g;
	for (const match of source.matchAll(pattern)) {
		fields.push({
			key: match[1],
			firmwareKey: match[2],
			min: Number(match[3]),
			max: Number(match[4]),
			integer: match[5] === "true",
			defaultValue: Number(match[6]),
		});
	}
	return fields;
}

function checkContract(root, errors) {
	const tsPath = path.join(root, "apps/web/lib/firmware/config.ts");
	const headerPath = path.join(root, "firmware/main/config.h");
	if (!fs.existsSync(tsPath) || !fs.existsSync(headerPath)) return;

	const tsFields = parseTypeScriptFields(fs.readFileSync(tsPath, "utf8"));
	const headerFields = parseHeaderFields(fs.readFileSync(headerPath, "utf8"));

	if (tsFields.length === 0) errors.push("config.ts: could not parse CONFIG_FIELDS");
	if (headerFields.length === 0) errors.push("config.h: could not parse FW_CONFIG_FIELDS");
	if (tsFields.length !== headerFields.length) {
		errors.push(
			`config contract length differs: server ${tsFields.length}, firmware ${headerFields.length}`,
		);
		return;
	}

	for (let index = 0; index < tsFields.length; index += 1) {
		const server = tsFields[index];
		const firmware = headerFields[index];
		if (JSON.stringify(server) !== JSON.stringify(firmware)) {
			errors.push(
				`config contract drift at ${server.key}: server ${JSON.stringify(server)} vs firmware ${JSON.stringify(firmware)}`,
			);
		}
	}
}

function checkIdentity(target, errors) {
	const identity = /lifelink/i;
	for (const file of walk(target)) {
		if (!isTextFile(file)) continue;
		const relative = path.relative(target, file).split(path.sep).join("/");
		if (relative === "SCAFFOLD.md" || relative === "LICENSE" || relative === "ATTRIBUTIONS.md")
			continue;
		const content = fs.readFileSync(file, "utf8");
		const match = identity.exec(content);
		if (match) {
			const line = content.slice(0, match.index).split("\n").length;
			errors.push(`identity token "lifelink" still present at ${relative}:${line}`);
		}
	}
}

function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (error) {
		console.error(`error: ${error.message}`);
		process.exit(1);
	}

	const root = args.target ?? ROOT;
	const label = args.target ? path.basename(args.target) : "LifeLink template";
	const errors = [];

	checkRequired(root, errors);
	checkContract(root, errors);
	if (args.self) {
		// The source intentionally uses "LifeLink"; the generated project must not.
	} else {
		checkIdentity(root, errors);
	}
	checkForbidden(root, errors);

	console.log(`Checked ${label}`);
	if (errors.length === 0) {
		console.log("  required files: ok");
		console.log("  firmware/server config contract: ok");
		console.log("  forbidden template vocabulary: none");
		if (!args.self) console.log("  identity tokens: replaced");
		console.log("Result: PASS");
		return;
	}

	for (const error of errors) console.log(`  - ${error}`);
	console.log(`Result: FAIL (${errors.length} issue${errors.length === 1 ? "" : "s"})`);
	process.exit(1);
}

main();
