#!/usr/bin/env node
/*
  LifeLink generators.

  Usage:
    node stack/generators/gen.mjs feature incidents
    node stack/generators/gen.mjs device-route telemetry
    node stack/generators/gen.mjs firmware-module gps
    node stack/generators/gen.mjs model Trip

  Options:
    --dir <project>   Project root (default: current directory)
    --force           Overwrite existing files
    --dry-run         Print the files without writing them

  Every generated slice follows the LifeLink architecture:
    page + server action + pure schema + test
    device route + schema + test
    firmware header + native Unity test
    Prisma model + schema + test
*/
import fs from "node:fs";
import path from "node:path";

function usage() {
	console.log(`LifeLink generators

  node stack/generators/gen.mjs <command> <name> [options]

Commands:
  feature <name>           Dashboard page + server action + schema + test
  device-route <name>      Device API route + schema + test
  firmware-module <name>   Pure C++ header + native Unity test
  model <Name>             Prisma model + schema + test

Options:
  --dir <project>          Project root (default: current directory)
  --force                  Overwrite existing files
  --dry-run                Print the files without writing
`);
}

function parseArgs(argv) {
	const args = { force: false, dryRun: false, dir: process.cwd() };
	const positional = [];
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--help" || token === "-h") {
			usage();
			process.exit(0);
		}
		if (token === "--force") args.force = true;
		else if (token === "--dry-run") args.dryRun = true;
		else if (token === "--dir") {
			const value = argv[index + 1];
			if (!value) throw new Error("--dir requires a path");
			args.dir = path.resolve(process.cwd(), value);
			index += 1;
		} else if (token.startsWith("--")) {
			throw new Error(`Unknown option: ${token}`);
		} else {
			positional.push(token);
		}
	}
	if (positional.length < 2) throw new Error("Expected a command and a name.");
	return { command: positional[0], name: positional[1], ...args };
}

function pascal(value) {
	return value
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join("");
}

function camel(value) {
	const result = pascal(value);
	return result[0].toLowerCase() + result.slice(1);
}

function title(value) {
	return value
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(" ");
}

function assertSlug(value, label) {
	if (!/^[a-z][a-z0-9-]{0,49}$/.test(value)) {
		throw new Error(`${label} must be lowercase kebab-case, e.g. crash-events.`);
	}
}

function assertModel(value) {
	if (!/^[A-Z][A-Za-z0-9]{1,49}$/.test(value)) {
		throw new Error("model name must be PascalCase, e.g. Trip.");
	}
}

function assertFirmware(value) {
	if (!/^[a-z][a-z0-9_]{1,49}$/.test(value)) {
		throw new Error("firmware module must be lowercase with underscores, e.g. power_budget.");
	}
}

function write(project, relative, content, options) {
	const full = path.join(project, relative);
	if (options.dryRun) {
		console.log(`  would write ${relative} (${content.length} bytes)`);
		return;
	}
	if (fs.existsSync(full) && !options.force) {
		throw new Error(`${relative} already exists. Pass --force to overwrite.`);
	}
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, content, "utf8");
	console.log(`  wrote ${relative}`);
}

function feature(project, name, options) {
	assertSlug(name, "feature name");
	const Name = pascal(name);
	const camelName = camel(name);
	const label = title(name);
	const base = `apps/web/app/[locale]/(dashboard)/${name}`;
	const schemaDir = `apps/web/lib/${name}`;

	write(
		project,
		`${base}/page.tsx`,
		`import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function ${Name}Page({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	await requireUser();
	const t = await getTranslations({ locale, namespace: "common" });

	return (
		<>
			<PageHeader title="${label}" subtitle="Replace this generated page with the real feature." />
			<Card>
				<CardContent className="pt-5">
					<EmptyState title={t("noData")} body="Wire the query and the action for ${label}." />
				</CardContent>
			</Card>
		</>
	);
}
`,
		options,
	);

	write(
		project,
		`${schemaDir}/schema.ts`,
		`import { z } from "zod";

export const ${camelName}InputSchema = z.object({
	name: z.string().trim().min(2, "Enter a name.").max(120),
});

export type ${Name}Input = z.infer<typeof ${camelName}InputSchema>;
`,
		options,
	);

	write(
		project,
		`${schemaDir}/schema.test.ts`,
		`import { describe, expect, it } from "vitest";
import { ${camelName}InputSchema } from "./schema";

describe("${name} input", () => {
	it("accepts a valid name", () => {
		expect(${camelName}InputSchema.safeParse({ name: "${label}" }).success).toBe(true);
	});

	it("rejects a short name", () => {
		expect(${camelName}InputSchema.safeParse({ name: "x" }).success).toBe(false);
	});
});
`,
		options,
	);

	write(
		project,
		`apps/web/lib/actions/${name}.ts`,
		`"use server";

import { canWrite, requireUser } from "@/lib/auth/session";
import { ${camelName}InputSchema, type ${Name}Input } from "@/lib/${name}/schema";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function localeFrom(formData: FormData): string {
	return String(formData.get("locale") ?? "en") === "tl" ? "tl" : "en";
}

/**
 * Generated skeleton. Replace the audit-only write with the real domain write.
 * The important part is the shape: authenticate, authorize, validate, mutate,
 * audit, revalidate, redirect.
 */
export async function create${Name}Action(formData: FormData) {
	const locale = localeFrom(formData);
	const current = await requireUser();
	if (!canWrite(current.role)) redirect(\`/\${locale}/${name}?error=forbidden\`);

	const parsed = ${camelName}InputSchema.safeParse({
		name: String(formData.get("name") ?? ""),
	});
	if (!parsed.success) redirect(\`/\${locale}/${name}?error=invalid\`);
	const input: ${Name}Input = parsed.data;

	await prisma.auditLog.create({
		data: {
			orgId: current.org.id,
			actorId: current.user.id,
			action: "${name}.created",
			metadata: input,
		},
	});

	revalidatePath(\`/\${locale}/${name}\`);
	redirect(\`/\${locale}/${name}?created=1\`);
}
`,
		options,
	);

	console.log("");
	console.log("Add the route to the sidebar and the message keys before shipping.");
}

function deviceRoute(project, name, options) {
	assertSlug(name, "route name");
	const Name = pascal(name);
	const camelName = camel(name);

	write(
		project,
		`apps/web/lib/device/${name}-schema.ts`,
		`import { z } from "zod";

export const ${camelName}PayloadSchema = z.object({
	device_id: z.string().min(1).max(64),
	value: z.number().min(0).max(1_000_000).optional(),
});

export type ${Name}Payload = z.infer<typeof ${camelName}PayloadSchema>;
`,
		options,
	);

	write(
		project,
		`apps/web/lib/device/${name}-schema.test.ts`,
		`import { describe, expect, it } from "vitest";
import { ${camelName}PayloadSchema } from "./${name}-schema";

describe("${name} device payload", () => {
	it("accepts a device id", () => {
		expect(${camelName}PayloadSchema.safeParse({ device_id: "AA:BB:CC:DD:EE:01" }).success).toBe(true);
	});

	it("rejects an empty device id", () => {
		expect(${camelName}PayloadSchema.safeParse({ device_id: "" }).success).toBe(false);
	});
});
`,
		options,
	);

	write(
		project,
		`apps/web/app/api/device/${name}/route.ts`,
		`import { badRequest, forbidden } from "@/lib/api/errors";
import { ok } from "@/lib/api/envelope";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";
import { ${camelName}PayloadSchema } from "@/lib/device/${name}-schema";

export const dynamic = "force-dynamic";

/**
 * Generated device route. The token is hashed at rest and checked by
 * requireDevice; the body is validated before any write.
 */
export const POST = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

		const parsed = ${camelName}PayloadSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) throw badRequest("Invalid ${name} payload.", parsed.error.flatten());

		if (parsed.data.device_id !== device.mac && parsed.data.device_id !== device.id) {
			throw forbidden("device_id does not match the authenticated token.");
		}

		return ok({ received: true, device_id: device.id });
	},
	{ route: "POST /api/device/${name}", timeoutMs: 10_000 },
);
`,
		options,
	);
}

function firmwareModule(project, name, options) {
	assertFirmware(name, "firmware module");
	const Name = pascal(name);

	write(
		project,
		`firmware/main/${name}.h`,
		`#pragma once

#include <stdint.h>

namespace fw {

/**
 * Generated pure module. Keep Arduino calls out of this header so the native
 * Unity tests can compile it on the host.
 */
class ${Name} {
  public:
	explicit ${Name}(uint32_t intervalMs) : intervalMs_(intervalMs) {}

	bool ready(uint32_t nowMs) const {
		return lastMs_ == 0 || (nowMs - lastMs_) >= intervalMs_;
	}

	void mark(uint32_t nowMs) { lastMs_ = nowMs; }

  private:
	uint32_t intervalMs_;
	uint32_t lastMs_ = 0;
};

}  // namespace fw
`,
		options,
	);

	write(
		project,
		`firmware/test/test_${name}/test_${name}.cpp`,
		`#include <unity.h>

#include "../../main/${name}.h"

using namespace fw;

void setUp(void) {}
void tearDown(void) {}

void test_the_first_call_is_ready(void) {
	${Name} gate(1000);
	TEST_ASSERT_TRUE(gate.ready(0));
}

void test_the_gate_opens_after_the_interval(void) {
	${Name} gate(1000);
	gate.mark(100);
	TEST_ASSERT_FALSE(gate.ready(500));
	TEST_ASSERT_TRUE(gate.ready(1100));
}

int main(int, char**) {
	UNITY_BEGIN();
	RUN_TEST(test_the_first_call_is_ready);
	RUN_TEST(test_the_gate_opens_after_the_interval);
	return UNITY_END();
}
`,
		options,
	);
}

function model(project, name, options) {
	assertModel(name, "model");
	const schemaPath = path.join(project, "apps/web/prisma/schema.prisma");
	const schema = fs.readFileSync(schemaPath, "utf8");
	const existing = new RegExp(`model\\s+${name}\\s*\\{`);
	if (existing.test(schema) && !options.force) {
		throw new Error(`model ${name} already exists in schema.prisma.`);
	}

	const block = `
// @generated models — append new models below this line.
model ${name} {
  id        String   @id @default(cuid())
  orgId     String
  name      String
  createdAt DateTime @default(now())

  @@index([orgId, createdAt])
}
`;

	if (options.dryRun) {
		console.log(`  would append model ${name} to apps/web/prisma/schema.prisma`);
	} else {
		fs.appendFileSync(schemaPath, block, "utf8");
		console.log(`  appended model ${name} to apps/web/prisma/schema.prisma`);
	}

	const camelName = name[0].toLowerCase() + name.slice(1);
	write(
		project,
		`apps/web/lib/${camelName}/schema.ts`,
		`import { z } from "zod";

export const ${camelName}InputSchema = z.object({
	name: z.string().trim().min(2).max(120),
});

export type ${name}Input = z.infer<typeof ${camelName}InputSchema>;
`,
		options,
	);

	console.log("");
	console.log("Next:");
	console.log("  pnpm prisma:generate");
	console.log(`  pnpm prisma:migrate --name add_${name.toLowerCase()}`);
	console.log("Then add the Organization back-relation before using it in a query.");
}

function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (error) {
		console.error(`error: ${error.message}`);
		usage();
		process.exit(1);
	}

	if (!fs.existsSync(path.join(args.dir, "apps/web/package.json"))) {
		console.error(
			`error: ${args.dir} does not look like a LifeLink project (apps/web/package.json missing).`,
		);
		process.exit(1);
	}

	console.log(`LifeLink generator: ${args.command} ${args.name}`);
	try {
		switch (args.command) {
			case "feature":
				feature(args.dir, args.name, args);
				break;
			case "device-route":
				deviceRoute(args.dir, args.name, args);
				break;
			case "firmware-module":
				firmwareModule(args.dir, args.name, args);
				break;
			case "model":
				model(args.dir, args.name, args);
				break;
			default:
				throw new Error(`Unknown command: ${args.command}`);
		}
	} catch (error) {
		console.error(`error: ${error.message}`);
		process.exit(1);
	}
}

main();
