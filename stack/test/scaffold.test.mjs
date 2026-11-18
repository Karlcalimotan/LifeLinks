import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CLI = path.join(ROOT, "stack/src/cli.mjs");
const VERIFY = path.join(ROOT, "stack/src/verify.mjs");
const GEN = path.join(ROOT, "stack/generators/gen.mjs");

function run(script, args, cwd = ROOT) {
	return spawnSync(process.execPath, [script, ...args], {
		cwd,
		encoding: "utf8",
	});
}

test("scaffolds a project with the new identity", () => {
	const target = fs.mkdtempSync(path.join(os.tmpdir(), "lifelink-stack-"));
	try {
		const result = run(CLI, [
			"--target",
			target,
			"--name",
			"Test Fleet",
			"--slug",
			"test-fleet",
			"--scope",
			"@test-fleet",
			"--token-prefix",
			"tf",
		]);
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const rootPackage = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
		assert.equal(rootPackage.name, "test-fleet");

		const webPackage = JSON.parse(
			fs.readFileSync(path.join(target, "apps/web/package.json"), "utf8"),
		);
		assert.equal(webPackage.name, "@test-fleet/web");

		const constants = fs.readFileSync(path.join(target, "apps/web/lib/constants.ts"), "utf8");
		assert.match(constants, /DEVICE_TOKEN_PREFIX = "tf_"/);

		const schema = fs.readFileSync(path.join(target, "apps/web/prisma/schema.prisma"), "utf8");
		assert.match(schema, /model TrackerDevice/);

		assert.equal(fs.existsSync(path.join(target, "firmware/main/config.h")), true);
		assert.equal(fs.existsSync(path.join(target, "stack/src/cli.mjs")), true);
		assert.equal(fs.existsSync(path.join(target, "node_modules")), false);
		assert.equal(fs.existsSync(path.join(target, "pnpm-lock.yaml")), false);

		const verification = run(VERIFY, ["--target", target]);
		assert.equal(verification.status, 0, verification.stdout + verification.stderr);
		assert.match(verification.stdout, /Result: PASS/);
	} finally {
		fs.rmSync(target, { recursive: true, force: true });
	}
});

test("generators run in dry-run mode without touching the project", () => {
	const feature = run(GEN, ["feature", "maintenance", "--dir", ROOT, "--dry-run"]);
	assert.equal(feature.status, 0, feature.stderr);
	assert.match(
		feature.stdout,
		/would write apps\/web\/app\/\[locale\]\/\(dashboard\)\/maintenance\/page\.tsx/,
	);

	const route = run(GEN, ["device-route", "telemetry", "--dir", ROOT, "--dry-run"]);
	assert.equal(route.status, 0, route.stderr);
	assert.match(route.stdout, /would write apps\/web\/app\/api\/device\/telemetry\/route\.ts/);

	const firmware = run(GEN, ["firmware-module", "power_budget", "--dir", ROOT, "--dry-run"]);
	assert.equal(firmware.status, 0, firmware.stderr);
	assert.match(firmware.stdout, /would write firmware\/main\/power_budget\.h/);

	const model = run(GEN, ["model", "MaintenanceLog", "--dir", ROOT, "--dry-run"]);
	assert.equal(model.status, 0, model.stderr);
	assert.match(model.stdout, /would append model MaintenanceLog/);
});
