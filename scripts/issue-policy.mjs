#!/usr/bin/env node
/**
 * Issue-first policy CLI for pull requests.
 *
 * Reads:
 *   PR_TITLE, PR_BODY, PR_AUTHOR, PR_LABELS
 *
 * When GH_TOKEN and GITHUB_REPOSITORY are both set, each referenced issue is
 * resolved through `gh issue view` so a typo cannot pass CI.
 */
import { spawnSync } from "node:child_process";
import { evaluateIssuePolicy } from "./lib/issue-policy.mjs";

function fail(message) {
	console.error(`issue-policy: FAIL (${message})`);
}

function verifyIssue(repo, number) {
	const result = spawnSync(
		"gh",
		["issue", "view", String(number), "--repo", repo, "--json", "number,state,title,url"],
		{ encoding: "utf8", windowsHide: true },
	);

	if (result.error) {
		return {
			ok: false,
			reason: "the gh CLI is not available",
		};
	}
	if (result.status !== 0) {
		return {
			ok: false,
			reason: "the issue does not exist or GH_TOKEN cannot read it",
		};
	}

	try {
		const issue = JSON.parse(result.stdout);
		if (!issue || issue.number !== number) {
			return { ok: false, reason: "gh returned an unexpected issue payload" };
		}
		return { ok: true };
	} catch {
		return { ok: false, reason: "gh returned invalid JSON" };
	}
}

function main() {
	const labels = (process.env.PR_LABELS ?? "").split(",");
	const result = evaluateIssuePolicy({
		title: process.env.PR_TITLE ?? "",
		body: process.env.PR_BODY ?? "",
		author: process.env.PR_AUTHOR ?? "",
		labels,
	});

	if (!result.ok) {
		fail(result.errors.join(" "));
		process.exitCode = 1;
		return;
	}

	if (result.exempt) {
		console.log(`issue-policy: PASS (exempt: ${result.exempt})`);
		return;
	}

	const repo = process.env.GITHUB_REPOSITORY;
	const token = process.env.GH_TOKEN;
	if (repo && token) {
		for (const number of result.numbers) {
			const resolved = verifyIssue(repo, number);
			if (!resolved.ok) {
				fail(`issue #${number} could not be resolved in ${repo}: ${resolved.reason}`);
				process.exitCode = 1;
				return;
			}
		}
	}

	const linked = result.numbers.map((number) => `#${number}`).join(", ");
	console.log(`issue-policy: PASS (linked ${linked})`);
}

try {
	main();
} catch (error) {
	fail(error instanceof Error ? error.message : "unexpected error");
	process.exitCode = 1;
}
