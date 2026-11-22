import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const seedPath = fileURLToPath(new URL("../apps/web/prisma/seed.ts", import.meta.url));

const FORBIDDEN = [
	{ label: "AA:BB:CC MAC placeholder", pattern: /AA:BB:CC/i },
	{ label: "lorem ipsum", pattern: /lorem/i },
	{ label: "John Doe", pattern: /john\s+doe/i },
	{ label: "asdf", pattern: /asdf/i },
	{ label: "Spare tracker label", pattern: /spare\s+tracker/i },
];

let source;
try {
	source = await readFile(seedPath, "utf8");
} catch (error) {
	console.error(`Cannot read the demo seed at ${seedPath}`);
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

const lines = source.split(/\r?\n/);
const hits = [];

for (const [index, line] of lines.entries()) {
	for (const rule of FORBIDDEN) {
		if (rule.pattern.test(line)) {
			hits.push(`${index + 1}: ${rule.label}: ${line.trim()}`);
		}
	}
}

if (hits.length > 0) {
	console.error(`Demo seed contains ${hits.length} forbidden placeholder value(s):`);
	for (const hit of hits) console.error(`  ${hit}`);
	process.exit(1);
}

console.log(`Seed check passed: ${lines.length} lines scanned, no placeholder data found.`);
