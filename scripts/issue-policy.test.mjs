import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	evaluateIssuePolicy,
	findIssueReferences,
	isBotAuthor,
	normalizeLabels,
} from "./lib/issue-policy.mjs";

describe("issue references", () => {
	it("accepts Closes #21", () => {
		const result = evaluateIssuePolicy({
			title: "",
			body: "Closes #21",
			author: "alice",
			labels: [],
		});
		assert.deepEqual(result, { ok: true, numbers: [21] });
	});

	it("accepts Fixes #7", () => {
		const result = evaluateIssuePolicy({
			body: "This fixes the tracker timeout. Fixes #7",
			author: "alice",
			labels: [],
		});
		assert.deepEqual(result, { ok: true, numbers: [7] });
	});

	it("collects Refs #3 and Part of #9 without duplicates", () => {
		assert.deepEqual(findIssueReferences("Refs #3 and Part of #9, then Refs #3 again."), [3, 9]);
	});

	it("does not match a bare issue number", () => {
		assert.deepEqual(findIssueReferences("See #21 for context."), []);
		const result = evaluateIssuePolicy({
			body: "See #21 for context.",
			author: "alice",
			labels: [],
		});
		assert.equal(result.ok, false);
		assert.match(result.errors[0], /No issue reference/);
	});

	it("does not match Closes # without a number", () => {
		assert.deepEqual(findIssueReferences("Closes #"), []);
		const result = evaluateIssuePolicy({
			body: "Closes #",
			author: "alice",
			labels: [],
		});
		assert.equal(result.ok, false);
	});
});

describe("exemptions", () => {
	it("exempts bot authors", () => {
		assert.equal(isBotAuthor("dependabot[bot]"), true);
		assert.equal(isBotAuthor("renovate[bot]"), true);
		assert.equal(isBotAuthor("github-actions[bot]"), true);
		assert.equal(isBotAuthor("some-random-bot[bot]"), true);
		assert.equal(isBotAuthor("alice"), false);
		assert.deepEqual(
			evaluateIssuePolicy({
				body: "No issue reference",
				author: "dependabot[bot]",
				labels: [],
			}),
			{ ok: true, exempt: "bot", numbers: [] },
		);
	});

	it("exempts promotion and release labels", () => {
		assert.deepEqual(
			evaluateIssuePolicy({
				body: "",
				author: "alice",
				labels: ["promotion"],
			}),
			{ ok: true, exempt: "label", numbers: [] },
		);
		assert.deepEqual(
			evaluateIssuePolicy({
				body: "",
				author: "alice",
				labels: ["release"],
			}),
			{ ok: true, exempt: "label", numbers: [] },
		);
	});

	it("matches labels case-insensitively and trims whitespace", () => {
		assert.deepEqual(normalizeLabels(["  RELEASE  ", "Infra"]), ["release", "infra"]);
		assert.deepEqual(
			evaluateIssuePolicy({
				body: "",
				author: "alice",
				labels: ["  Promotion  "],
			}),
			{ ok: true, exempt: "label", numbers: [] },
		);
	});
});
