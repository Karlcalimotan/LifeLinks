#!/usr/bin/env node
/*
  LifeLink stack CLI.

  The LifeLink app is the reference implementation. This script copies it into a
  new project, excluding runtime artifacts, and rewrites the identity tokens so
  the new project starts clean.

  Usage:
    node stack/src/cli.mjs --target ../MyProject --name "My Project" --slug my-project
    node stack/src/cli.mjs --target ../MyProject --name "My Project" --slug my-project \
      --scope @my-project --token-prefix mp_

  It never runs `pnpm install`, never touches git and never writes outside the
  target directory.
*/
import fs from "node:fs";
import path from "node:path";

const TEMPLATE_ROOT = path.resolve(import.meta.dirname, "../..");

const EXCLUDED_DIRS = new Set([
	"node_modules",
	".next",
	".git",
	".pio",
	"coverage",
	"test-results",
	"playwright-report",
	"blob-report",
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

function usage() {
	console.log(`LifeLink stack

  node stack/src/cli.mjs --target <dir> [options]

Required:
  --target <dir>        New project directory (must be empty or absent)

Options:
  --name <name>         Project name, e.g. "RoadGuard"        (default: LifeLink Clone)
  --slug <slug>         Lowercase package/slug, e.g. roadguard (default: lifelink-clone)
  --scope <scope>       Package scope, e.g. @roadguard         (default: @<slug>)
  --token-prefix <p>    Device token prefix, e.g. rg            (default: derived from slug)
  --force               Copy into a non-empty target (does not delete files)
  --help                Show this help
`);
}

function parseArgs(argv) {
	const args = { force: false };
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--help" || token === "-h") args.help = true;
		else if (token === "--force") args.force = true;
		else if (token.startsWith("--")) {
			const key = token.slice(2);
			const value = argv[index + 1];
			if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
			args[key] = value;
			index += 1;
		} else {
			throw new Error(`Unknown argument: ${token}`);
		}
	}
	return args;
}

function assertMatch(value, pattern, label) {
	if (!pattern.test(value)) throw new Error(`${label} is invalid: ${value}`);
}

function normalizeOptions(args) {
	if (args.help) {
		usage();
		process.exit(0);
	}
	if (!args.target) throw new Error("--target is required. Use --help for usage.");

	const name = String(args.name ?? "LifeLink Clone").trim();
	const slug = String(args.slug ?? "lifelink-clone")
		.trim()
		.toLowerCase();
	const scope = String(args.scope ?? `@${slug}`).trim();
	const tokenPrefix = String(
		args["token-prefix"] ??
			slug
				.replace(/[^a-z0-9]/g, "")
				.slice(0, 3)
				.padEnd(3, "x"),
	)
		.trim()
		.toLowerCase();

	assertMatch(name, /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}$/, "name");
	assertMatch(slug, /^[a-z][a-z0-9-]{0,49}$/, "slug");
	assertMatch(scope, /^@[a-z0-9][a-z0-9-]{0,49}$/, "scope");
	assertMatch(tokenPrefix, /^[a-z][a-z0-9]{1,7}$/, "token-prefix");

	return {
		target: path.resolve(process.cwd(), args.target),
		name,
		slug,
		scope,
		tokenPrefix,
		upper: name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
		force: Boolean(args.force),
	};
}

function isTextFile(filePath) {
	const base = path.basename(filePath);
	if (base === ".gitignore" || base === ".gitattributes" || base === ".npmrc") return true;
	if (base === "Dockerfile" || base === "LICENSE" || base === "VERSION") return true;
	return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function shouldExclude(relativePath, name) {
	const normalized = relativePath.split(path.sep).join("/");
	const segments = normalized.split("/");
	if (segments.some((segment) => EXCLUDED_DIRS.has(segment))) return true;
	if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) return true;
	if (name.endsWith(".tsbuildinfo") || name.endsWith(".log")) return true;
	if (normalized === "pnpm-lock.yaml") return true;
	if (normalized === "apps/web/next-env.d.ts") return true;
	if (normalized.startsWith("apps/web/.tmp-")) return true;
	return false;
}

function applyTokens(content, options) {
	return content
		.replaceAll("@lifelink/", `${options.scope}/`)
		.replaceAll("LifeLink", options.name)
		.replaceAll("LIFELINK", options.upper)
		.replaceAll("lifelink", options.slug)
		.replaceAll("llk_", `${options.tokenPrefix}_`)
		.replaceAll("llk-", `${options.tokenPrefix}-`);
}

function copyTree(source, destination, options) {
	fs.mkdirSync(destination, { recursive: true });
	for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
		const sourcePath = path.join(source, entry.name);
		const destinationPath = path.join(destination, entry.name);
		const relativePath = path.relative(TEMPLATE_ROOT, sourcePath);

		if (shouldExclude(relativePath, entry.name)) continue;

		if (entry.isDirectory()) {
			copyTree(sourcePath, destinationPath, options);
			continue;
		}
		if (!entry.isFile()) continue;

		if (isTextFile(sourcePath)) {
			const content = fs.readFileSync(sourcePath, "utf8");
			fs.writeFileSync(destinationPath, applyTokens(content, options), "utf8");
		} else {
			fs.copyFileSync(sourcePath, destinationPath);
		}
	}
}

function isTargetEmpty(target) {
	if (!fs.existsSync(target)) return true;
	const entries = fs.readdirSync(target).filter((entry) => entry !== ".git");
	return entries.length === 0;
}

function writeScaffoldNote(options) {
	const note = `# ${options.name}

Generated from the LifeLink vehicle-alert template on ${new Date().toISOString().slice(0, 10)}.

| Setting | Value |
| --- | --- |
| Package scope | \`${options.scope}\` |
| Slug | \`${options.slug}\` |
| Device token prefix | \`${options.tokenPrefix}_\` |
| Env prefix | \`${options.upper}_\` |

## First run

\`\`\`bash
pnpm install
pnpm db:up
pnpm prisma:generate
pnpm prisma:deploy
pnpm seed
pnpm dev
\`\`\`

Demo login after the seed: \`admin@${options.slug}.local\` / \`Admin123!\`.

## Before you ship

1. Read \`docs/architecture.md\`, \`docs/hardware.md\` and \`docs/safety.md\`.
2. Change \`firmware/main/main.ino\`'s API base URL to your host.
3. Generate a real \`AUTH_SECRET\` and \`CRON_SECRET\`.
4. Bench-test the cancel window, false-positive suite, SMS and power-cut path.
5. Replace the demo seed data with your own fleet.

The generator commands live in \`stack/README.md\`, and the stack is included in
this project so \`pnpm gen\` and \`pnpm stack:check\` work immediately.
`;
	fs.writeFileSync(path.join(options.target, "SCAFFOLD.md"), note, "utf8");
}

function main() {
	let options;
	try {
		options = normalizeOptions(parseArgs(process.argv.slice(2)));
	} catch (error) {
		console.error(`error: ${error.message}`);
		usage();
		process.exit(1);
	}

	if (!isTargetEmpty(options.target) && !options.force) {
		console.error(`error: target is not empty: ${options.target}`);
		console.error("Pass --force to copy over it (existing files are not deleted).");
		process.exit(1);
	}

	console.log(`LifeLink stack -> ${options.target}`);
	console.log(`  name:         ${options.name}`);
	console.log(`  slug:         ${options.slug}`);
	console.log(`  scope:        ${options.scope}`);
	console.log(`  token prefix: ${options.tokenPrefix}_`);

	for (const required of ["apps/web", "firmware", "packages/config", "package.json"]) {
		if (!fs.existsSync(path.join(TEMPLATE_ROOT, required))) {
			throw new Error(`Template root is missing ${required}. Run this from the LifeLink repo.`);
		}
	}

	copyTree(TEMPLATE_ROOT, options.target, options);
	writeScaffoldNote(options);

	console.log("");
	console.log("Done. Next:");
	console.log(`  cd ${path.relative(process.cwd(), options.target) || "."}`);
	console.log("  pnpm install");
	console.log("  pnpm db:up && pnpm prisma:deploy && pnpm seed");
	console.log("  pnpm dev");
	console.log("");
	console.log("Read SCAFFOLD.md for the identity settings and the pre-ship checklist.");
}

main();
