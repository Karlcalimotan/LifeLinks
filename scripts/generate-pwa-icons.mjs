#!/usr/bin/env node
/*
 * Generate the PWA PNG icons from the bundled brand mark.
 *
 * Playwright is already a dev dependency and is used only as a renderer, so no
 * image library or network font is added. The script is deterministic: fixed
 * sizes, fixed colours, no animation and no randomness. It also parses each
 * PNG header and fails if the output dimensions do not match the filename.
 *
 * Run from the repository root:
 *   node scripts/generate-pwa-icons.mjs
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "apps", "web", "public");
const outputDir = path.join(publicDir, "icons");

// Brand tokens: ink-950 canvas, signal-500 mark from logo-mark.svg.
const BACKGROUND = "#071013";

const ICONS = [
	// Regular icons: the mark is large but still leaves the platform's mask room.
	{ file: "icon-192.png", size: 192, markScale: 0.72 },
	{ file: "icon-512.png", size: 512, markScale: 0.72 },
	{ file: "apple-touch-icon.png", size: 180, markScale: 0.72 },
	// Maskable: mark inside the central 80% safe circle.
	{ file: "icon-maskable-512.png", size: 512, markScale: 0.52 },
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngSize(buffer) {
	if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
		throw new Error("not a PNG");
	}
	if (buffer.toString("ascii", 12, 16) !== "IHDR") {
		throw new Error("missing PNG IHDR");
	}
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function htmlFor({ size, markScale }, mark) {
	const logo = Math.round(size * markScale);
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html, body { margin: 0; padding: 0; width: ${size}px; height: ${size}px; overflow: hidden; }
body { background: ${BACKGROUND}; }
.wrap { width: 100%; height: 100%; display: grid; place-items: center; }
.mark { width: ${logo}px; height: ${logo}px; }
.mark svg { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
<div class="wrap"><div class="mark">${mark}</div></div>
</body>
</html>`;
}

async function main() {
	const mark = await readFile(path.join(publicDir, "logo-mark.svg"), "utf8");
	await mkdir(outputDir, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage({ deviceScaleFactor: 1 });
		for (const icon of ICONS) {
			await page.setViewportSize({ width: icon.size, height: icon.size });
			await page.setContent(htmlFor(icon, mark), { waitUntil: "load" });
			const target = path.join(outputDir, icon.file);
			await page.screenshot({
				path: target,
				type: "png",
				animations: "disabled",
				clip: { x: 0, y: 0, width: icon.size, height: icon.size },
			});
			const actual = readPngSize(await readFile(target));
			if (actual.width !== icon.size || actual.height !== icon.size) {
				throw new Error(
					`${icon.file}: expected ${icon.size}x${icon.size}, got ${actual.width}x${actual.height}`,
				);
			}
			console.log(`wrote ${path.relative(root, target)} (${actual.width}x${actual.height})`);
		}
	} finally {
		await browser.close();
	}
}

await main();
