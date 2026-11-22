import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluatePr, mergeOne, runAll, runSingle } from "./merge-pr.mjs";

const REPO = "owner/repo";

function checksPayload(contexts = ["Web", "Firmware"]) {
	return { required_status_checks: { strict: true, contexts } };
}

function validPr(overrides = {}) {
	return {
		number: 7,
		title: "feat: sample change",
		url: "https://example.test/owner/repo/pull/7",
		state: "OPEN",
		isDraft: false,
		baseRefName: "develop",
		baseRefOid: "base-sha-1",
		headRefName: "feat/7-sample",
		headRefOid: "head-sha-1",
		mergeable: "MERGEABLE",
		mergeStateStatus: "CLEAN",
		statusCheckRollup: [
			{ name: "Web", status: "COMPLETED", conclusion: "SUCCESS" },
			{ name: "Firmware", status: "COMPLETED", conclusion: "SUCCESS" },
		],
		labels: [],
		...overrides,
	};
}

/**
 * In-process stand-in for the `gh` CLI. Every response is a fixture; nothing
 * reaches GitHub, a real pull request or a real merge.
 */
function createFakeGh(options = {}) {
	const calls = [];
	const prs = new Map((options.prs ?? []).map((pr) => [Number(pr.number), pr]));
	const protection = new Map(Object.entries(options.protection ?? {}));
	const lists = new Map(Object.entries(options.lists ?? {}));
	const verifications = new Map(Object.entries(options.verifications ?? {}));
	const viewQueues = new Map();

	const ok = (stdout = "") => ({ ok: true, status: 0, stdout, stderr: "", error: null });
	const fail = (stderr) => ({ ok: false, status: 1, stdout: "", stderr, error: null });

	function gh(args) {
		calls.push([...args]);

		if (args[0] === "api") {
			const match =
				/^repos\/[^/]+\/[^/]+\/branches\/([^/]+)\/protection\/required_status_checks$/.exec(
					args[1] ?? "",
				);
			if (!match) return fail("unexpected API request");
			const base = match[1];
			if (!protection.has(base)) return fail(`HTTP 404: branch ${base} is not protected`);
			return ok(JSON.stringify(protection.get(base)));
		}

		if (args[0] === "pr" && args[1] === "view") {
			const number = Number(args[2]);
			const jsonAt = args.indexOf("--json");
			const fields = jsonAt === -1 ? "" : args[jsonAt + 1];

			if (fields === "state,mergeCommit,baseRefName") {
				const snapshot = verifications.get(String(number));
				if (snapshot) return ok(JSON.stringify(snapshot));
				const pr = prs.get(number);
				return ok(
					JSON.stringify({
						state: "MERGED",
						mergeCommit: { oid: `merge-${number}` },
						baseRefName: pr?.baseRefName ?? "develop",
					}),
				);
			}

			const queue = viewQueues.get(number);
			if (queue && queue.length > 0) return ok(JSON.stringify(queue.shift()));

			const pr = prs.get(number);
			if (!pr) return fail(`could not resolve pull request #${number}`);
			return ok(JSON.stringify(pr));
		}

		if (args[0] === "pr" && args[1] === "list") {
			const base = args[args.indexOf("--base") + 1];
			return ok(JSON.stringify(lists.get(base) ?? []));
		}

		if (args[0] === "pr" && args[1] === "merge") return ok("");

		return fail(`unexpected gh call: ${args.join(" ")}`);
	}

	return {
		calls,
		gh,
		queueView(number, snapshots) {
			viewQueues.set(Number(number), [...snapshots]);
		},
	};
}

function captureOutput(t) {
	const logs = [];
	const errors = [];
	t.mock.method(console, "log", (...args) => logs.push(args.join(" ")));
	t.mock.method(console, "error", (...args) => errors.push(args.join(" ")));
	return { logs, errors };
}

function mergeCalls(fake) {
	return fake.calls.filter((args) => args[0] === "pr" && args[1] === "merge");
}

function listBases(fake) {
	return fake.calls
		.filter((args) => args[0] === "pr" && args[1] === "list")
		.map((args) => args[args.indexOf("--base") + 1]);
}

describe("main is forbidden", () => {
	it("refuses a pull request targeting main without reading main protection", (t) => {
		captureOutput(t);
		const fake = createFakeGh({ protection: { develop: checksPayload() } });

		const evaluation = evaluatePr(validPr({ baseRefName: "main" }), REPO, fake.gh);

		assert.equal(evaluation.eligible, false);
		assert.match(evaluation.reasons.join("; "), /main is forbidden/);
		assert.equal(
			fake.calls.some((args) => args[0] === "api"),
			false,
		);
	});

	it("never asks --all to list main", (t) => {
		captureOutput(t);
		const fake = createFakeGh({
			prs: [validPr({ number: 99, baseRefName: "main" })],
			lists: { main: [{ number: 99, title: "main change", url: "" }] },
		});

		const ok = runAll(REPO, false, fake.gh);

		assert.equal(ok, true);
		assert.deepEqual(listBases(fake), ["develop", "staging"]);
		assert.equal(
			fake.calls.some((args) => args.includes("99")),
			false,
		);
		assert.deepEqual(mergeCalls(fake), []);
	});

	it("refuses a main-targeted pull request even if it is listed", (t) => {
		const { logs } = captureOutput(t);
		const pr = validPr({ number: 9, baseRefName: "main" });
		const fake = createFakeGh({
			prs: [pr],
			protection: { develop: checksPayload() },
			lists: { develop: [{ number: 9, title: pr.title, url: pr.url }] },
		});

		const ok = runAll(REPO, false, fake.gh);

		assert.equal(ok, true);
		assert.deepEqual(mergeCalls(fake), []);
		assert.ok(logs.some((line) => line.includes("skipped") && line.includes("main is forbidden")));
	});

	it("mergeOne refuses a main base even when called directly", (t) => {
		captureOutput(t);
		const pr = validPr({ baseRefName: "main" });
		const fake = createFakeGh({ prs: [pr], protection: { main: checksPayload() } });

		const result = mergeOne(pr, REPO, fake.gh);

		assert.equal(result.ok, false);
		assert.match(result.error, /main is forbidden/);
		assert.deepEqual(mergeCalls(fake), []);
	});
});

describe("ineligible pull requests are refused", () => {
	const cases = [
		{ name: "a draft", overrides: { isDraft: true }, reason: /draft/ },
		{
			name: "a conflicting pull request",
			overrides: { mergeable: "CONFLICTING" },
			reason: /mergeable is CONFLICTING, not MERGEABLE/,
		},
		{
			name: "a behind branch",
			overrides: { mergeStateStatus: "BEHIND" },
			reason: /merge state is BEHIND, not CLEAN/,
		},
		{
			name: "a do-not-merge label",
			overrides: { labels: [{ name: "do-not-merge" }] },
			reason: /blocked labels: do-not-merge/,
		},
		{
			name: "a wip label",
			overrides: { labels: ["WIP"] },
			reason: /blocked labels: wip/,
		},
		{
			name: "a blocked label",
			overrides: { labels: [{ name: "Blocked" }] },
			reason: /blocked labels: blocked/,
		},
		{
			name: "a closed pull request",
			overrides: { state: "CLOSED" },
			reason: /state is CLOSED, not OPEN/,
		},
	];

	for (const { name, overrides, reason } of cases) {
		it(`refuses ${name}`, (t) => {
			captureOutput(t);
			const fake = createFakeGh({ protection: { develop: checksPayload() } });

			const evaluation = evaluatePr(validPr(overrides), REPO, fake.gh);

			assert.equal(evaluation.eligible, false);
			assert.match(evaluation.reasons.join("; "), reason);
		});
	}
});

describe("required checks fail closed", () => {
	it("refuses when branch protection is unavailable", (t) => {
		captureOutput(t);
		const fake = createFakeGh();

		const evaluation = evaluatePr(validPr(), REPO, fake.gh);

		assert.equal(evaluation.eligible, false);
		assert.ok(evaluation.checkError);
		assert.match(evaluation.reasons.join("; "), /refusing \(fail closed\)/);
	});

	it("refuses when no required checks are configured", (t) => {
		captureOutput(t);
		const fake = createFakeGh({ protection: { develop: checksPayload([]) } });

		const evaluation = evaluatePr(validPr(), REPO, fake.gh);

		assert.equal(evaluation.eligible, false);
		assert.match(evaluation.checkError, /no required status checks configured/);
	});

	it("refuses a pending required check", (t) => {
		captureOutput(t);
		const fake = createFakeGh({ protection: { develop: checksPayload() } });
		const pr = validPr({
			statusCheckRollup: [
				{ name: "Web", status: "IN_PROGRESS", conclusion: null },
				{ name: "Firmware", status: "COMPLETED", conclusion: "SUCCESS" },
			],
		});

		const evaluation = evaluatePr(pr, REPO, fake.gh);

		assert.equal(evaluation.eligible, false);
		assert.match(evaluation.reasons.join("; "), /required check Web: IN_PROGRESS/);
	});

	it("refuses a failed required check", (t) => {
		captureOutput(t);
		const fake = createFakeGh({ protection: { develop: checksPayload() } });
		const pr = validPr({
			statusCheckRollup: [
				{ name: "Web", status: "COMPLETED", conclusion: "FAILURE" },
				{ name: "Firmware", status: "COMPLETED", conclusion: "SUCCESS" },
			],
		});

		const evaluation = evaluatePr(pr, REPO, fake.gh);

		assert.equal(evaluation.eligible, false);
		assert.match(evaluation.reasons.join("; "), /required check Web: COMPLETED \/ FAILURE/);
	});

	it("refuses a missing required check", (t) => {
		captureOutput(t);
		const fake = createFakeGh({ protection: { develop: checksPayload() } });
		const pr = validPr({
			statusCheckRollup: [{ name: "Web", status: "COMPLETED", conclusion: "SUCCESS" }],
		});

		const evaluation = evaluatePr(pr, REPO, fake.gh);

		assert.equal(evaluation.eligible, false);
		assert.match(evaluation.reasons.join("; "), /required check Firmware: MISSING/);
	});

	it("--all returns failure when branch protection is unavailable", (t) => {
		const { logs } = captureOutput(t);
		const pr = validPr();
		const fake = createFakeGh({
			prs: [pr],
			lists: { develop: [{ number: 7, title: pr.title, url: pr.url }] },
		});

		const ok = runAll(REPO, false, fake.gh);

		assert.equal(ok, false);
		assert.deepEqual(mergeCalls(fake), []);
		assert.ok(
			logs.some((line) => line.startsWith("merge-pr: summary") && line.includes("failed=true")),
		);
	});

	it("--all returns failure when no required checks are configured", (t) => {
		const { logs } = captureOutput(t);
		const pr = validPr();
		const fake = createFakeGh({
			prs: [pr],
			protection: { develop: checksPayload([]) },
			lists: { develop: [{ number: 7, title: pr.title, url: pr.url }] },
		});

		const ok = runAll(REPO, false, fake.gh);

		assert.equal(ok, false);
		assert.deepEqual(mergeCalls(fake), []);
		assert.ok(
			logs.some((line) => line.startsWith("merge-pr: summary") && line.includes("failed=true")),
		);
	});
});

describe("changes between evaluation and merge are refused", () => {
	const cases = [
		{ name: "baseRefOid", changed: { baseRefOid: "base-sha-2" } },
		{ name: "headRefOid", changed: { headRefOid: "head-sha-2" } },
		{ name: "baseRefName", changed: { baseRefName: "main" } },
		{
			name: "baseRefName and baseRefOid",
			changed: { baseRefName: "staging", baseRefOid: "base-sha-2" },
		},
	];

	for (const { name, changed } of cases) {
		it(`refuses a ${name} change before gh pr merge`, (t) => {
			captureOutput(t);
			const original = validPr();
			const fake = createFakeGh({
				prs: [original],
				protection: { develop: checksPayload(), staging: checksPayload() },
			});
			fake.queueView(original.number, [validPr(changed)]);

			const result = mergeOne(original, REPO, fake.gh);

			assert.equal(result.ok, false);
			assert.match(result.error, /changed after evaluation/);
			assert.deepEqual(mergeCalls(fake), []);
		});
	}

	it("refuses when the pull request became a draft after evaluation", (t) => {
		captureOutput(t);
		const original = validPr();
		const fake = createFakeGh({
			prs: [original],
			protection: { develop: checksPayload() },
		});
		fake.queueView(original.number, [validPr({ isDraft: true })]);

		const result = mergeOne(original, REPO, fake.gh);

		assert.equal(result.ok, false);
		assert.match(result.error, /re-evaluation failed: .*draft/);
		assert.deepEqual(mergeCalls(fake), []);
	});
});

describe("dry-run never merges", () => {
	it("runSingle reports eligibility without calling gh pr merge", (t) => {
		const { logs } = captureOutput(t);
		const pr = validPr();
		const fake = createFakeGh({ prs: [pr], protection: { develop: checksPayload() } });

		const ok = runSingle(REPO, 7, true, fake.gh);

		assert.equal(ok, true);
		assert.deepEqual(mergeCalls(fake), []);
		assert.ok(logs.some((line) => line.includes("eligible, not merged")));
	});

	it("runAll reports eligibility without calling gh pr merge", (t) => {
		const { logs } = captureOutput(t);
		const pr = validPr();
		const fake = createFakeGh({
			prs: [pr],
			protection: { develop: checksPayload() },
			lists: { develop: [{ number: 7, title: pr.title, url: pr.url }] },
		});

		const ok = runAll(REPO, true, fake.gh);

		assert.equal(ok, true);
		assert.deepEqual(mergeCalls(fake), []);
		assert.ok(logs.some((line) => line.includes("eligible, not merged")));
	});
});

describe("merge and verification use the explicit repository", () => {
	it("merges the evaluated head and verifies the same repository", (t) => {
		captureOutput(t);
		const pr = validPr();
		const fake = createFakeGh({ prs: [pr], protection: { develop: checksPayload() } });

		const result = mergeOne(pr, REPO, fake.gh);

		assert.deepEqual(result, { ok: true, commit: "merge-7" });
		const [merge] = mergeCalls(fake);
		assert.ok(merge);
		assert.equal(merge[merge.indexOf("--repo") + 1], REPO);
		assert.equal(merge[merge.indexOf("--match-head-commit") + 1], pr.headRefOid);

		const verification = fake.calls.find(
			(args) =>
				args[0] === "pr" && args[1] === "view" && args.includes("state,mergeCommit,baseRefName"),
		);
		assert.ok(verification);
		assert.equal(verification[verification.indexOf("--repo") + 1], REPO);
	});

	it("fails when the merge lands outside develop and staging", (t) => {
		captureOutput(t);
		const pr = validPr();
		const fake = createFakeGh({
			prs: [pr],
			protection: { develop: checksPayload() },
			verifications: {
				7: { state: "MERGED", mergeCommit: { oid: "merge-7" }, baseRefName: "main" },
			},
		});

		const result = mergeOne(pr, REPO, fake.gh);

		assert.equal(result.ok, false);
		assert.match(result.error, /not develop\/staging/);
	});
});
