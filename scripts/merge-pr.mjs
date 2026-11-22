#!/usr/bin/env node
/**
 * Constrained PR merge helper for the integrator subagent.
 *
 * Only `develop` and `staging` are mergeable. `main` is never allowed.
 * Every required branch-protection check must be present and successful.
 *
 *   node scripts/merge-pr.mjs <number> [--dry-run]
 *   node scripts/merge-pr.mjs --all [--dry-run]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ALLOWED_BASES = new Set(["develop", "staging"]);
const BLOCKING_LABELS = new Set(["do-not-merge", "wip", "blocked"]);
const PR_FIELDS = [
	"number",
	"title",
	"url",
	"state",
	"isDraft",
	"baseRefName",
	"headRefName",
	"headRefOid",
	"mergeable",
	"mergeStateStatus",
	"statusCheckRollup",
	"labels",
].join(",");

const USAGE = `Usage:
  node scripts/merge-pr.mjs <number> [--dry-run]
  node scripts/merge-pr.mjs --all [--dry-run]

Only develop and staging are mergeable. main is never allowed.`;

function gh(args) {
	const result = spawnSync("gh", args, {
		cwd: ROOT,
		encoding: "utf8",
		windowsHide: true,
		maxBuffer: 16 * 1024 * 1024,
	});
	return {
		ok: !result.error && result.status === 0,
		status: result.status ?? 1,
		stdout: typeof result.stdout === "string" ? result.stdout.trim() : "",
		stderr: typeof result.stderr === "string" ? result.stderr.trim() : "",
		error: result.error ?? null,
	};
}

function shortError(result) {
	if (result.error) return `gh CLI error: ${result.error.message}`;
	const raw = (result.stderr || result.stdout || "gh command failed").trim().split(/\r?\n/)[0];
	return (
		raw
			.replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[redacted]")
			.replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted]")
			.slice(0, 240) || "gh command failed"
	);
}

function parseArgs(argv) {
	let all = false;
	let dryRun = false;
	let number = null;

	for (const arg of argv) {
		if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "--all") {
			all = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(USAGE);
			return null;
		} else if (/^[1-9]\d*$/.test(arg)) {
			if (number !== null) throw new Error(`Only one PR number is allowed.\n${USAGE}`);
			number = Number(arg);
		} else {
			throw new Error(`Unknown argument "${arg}".\n${USAGE}`);
		}
	}

	if (all && number !== null) throw new Error(`Cannot combine a PR number with --all.\n${USAGE}`);
	if (!all && number === null) throw new Error(USAGE);
	return { all, dryRun, number };
}

function resolveRepo() {
	const result = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
	if (!result.ok || !result.stdout) {
		throw new Error(`Could not resolve the repository: ${shortError(result)}`);
	}
	return result.stdout.split(/\r?\n/)[0].trim();
}

function fetchPr(repo, number) {
	const result = gh(["pr", "view", String(number), "--repo", repo, "--json", PR_FIELDS]);
	if (!result.ok) return { ok: false, error: shortError(result) };

	try {
		const pr = JSON.parse(result.stdout);
		if (!pr || Number(pr.number) !== number) {
			return { ok: false, error: "gh returned an unexpected pull-request payload" };
		}
		return { ok: true, pr };
	} catch {
		return { ok: false, error: "gh returned invalid JSON" };
	}
}

function requiredChecksFor(repo, base) {
	if (!ALLOWED_BASES.has(base)) {
		return { ok: false, error: `base ${base} is not allowed` };
	}

	const result = gh(["api", `repos/${repo}/branches/${base}/protection/required_status_checks`]);
	if (!result.ok) {
		return {
			ok: false,
			error: `required checks for base ${base} are unavailable (branch protection may be missing); refusing (fail closed)`,
		};
	}

	let payload;
	try {
		payload = JSON.parse(result.stdout || "{}");
	} catch {
		return { ok: false, error: "invalid required-status-checks JSON" };
	}

	const source = payload?.required_status_checks ?? payload;
	const contexts = new Set();
	if (Array.isArray(source?.contexts)) {
		for (const context of source.contexts) {
			if (typeof context === "string" && context.trim()) contexts.add(context.trim());
		}
	}
	if (Array.isArray(source?.checks)) {
		for (const check of source.checks) {
			if (check && typeof check.context === "string" && check.context.trim()) {
				contexts.add(check.context.trim());
			}
		}
	}

	const values = [...contexts].sort();
	if (values.length === 0) {
		return {
			ok: false,
			error: `no required status checks configured for base ${base}; refusing (fail closed)`,
		};
	}
	return { ok: true, contexts: values };
}

function normalizeCheck(entry) {
	if (!entry || typeof entry !== "object") return null;
	const name =
		typeof entry.name === "string"
			? entry.name
			: typeof entry.context === "string"
				? entry.context
				: "";
	if (!name.trim()) return null;

	let status = typeof entry.status === "string" ? entry.status.toUpperCase() : null;
	let conclusion = typeof entry.conclusion === "string" ? entry.conclusion.toUpperCase() : null;
	const state = typeof entry.state === "string" ? entry.state.toUpperCase() : null;

	if (!status && state) {
		if (state === "SUCCESS") {
			status = "COMPLETED";
			conclusion = "SUCCESS";
		} else if (state === "PENDING" || state === "EXPECTED") {
			status = "IN_PROGRESS";
			conclusion = state;
		} else {
			status = "COMPLETED";
			conclusion = state;
		}
	}

	return {
		name: name.trim(),
		status: status ?? "UNKNOWN",
		conclusion: conclusion ?? "UNKNOWN",
	};
}

function evaluateChecks(contexts, rollup) {
	const entries = Array.isArray(rollup)
		? rollup.map(normalizeCheck).filter((entry) => entry !== null)
		: [];
	const byName = new Map();
	for (const entry of entries) {
		const list = byName.get(entry.name) ?? [];
		list.push(entry);
		byName.set(entry.name, list);
	}

	const states = contexts.map((context) => {
		const matches = byName.get(context) ?? [];
		if (matches.length === 0) return { context, state: "MISSING", ok: false };
		const failed = matches.find(
			(entry) => entry.status !== "COMPLETED" || entry.conclusion !== "SUCCESS",
		);
		if (failed) {
			return {
				context,
				state: `${failed.status} / ${failed.conclusion}`,
				ok: false,
			};
		}
		return { context, state: "SUCCESS", ok: true };
	});

	return { states, ok: states.every((state) => state.ok) };
}

function labelNames(labels) {
	if (!Array.isArray(labels)) return [];
	return labels
		.map((label) => (typeof label === "string" ? label : label?.name))
		.filter((label) => typeof label === "string" && label.trim())
		.map((label) => label.trim().toLowerCase());
}

function evaluatePr(pr, repo) {
	const reasons = [];
	const labels = labelNames(pr.labels);

	if (pr.state !== "OPEN") reasons.push(`state is ${pr.state ?? "UNKNOWN"}, not OPEN`);
	if (pr.isDraft) reasons.push("the pull request is a draft");
	if (!ALLOWED_BASES.has(pr.baseRefName)) {
		reasons.push(
			`base ${pr.baseRefName ?? "unknown"} is not allowed; only develop and staging are mergeable (main is forbidden)`,
		);
	}
	if (pr.mergeable !== "MERGEABLE") {
		reasons.push(`mergeable is ${pr.mergeable ?? "UNKNOWN"}, not MERGEABLE`);
	}
	if (pr.mergeStateStatus !== "CLEAN") {
		reasons.push(`merge state is ${pr.mergeStateStatus ?? "UNKNOWN"}, not CLEAN`);
	}

	const blocked = labels.filter((label) => BLOCKING_LABELS.has(label));
	if (blocked.length > 0) reasons.push(`blocked labels: ${blocked.join(", ")}`);
	if (!pr.headRefOid) reasons.push("the head commit SHA is missing");

	let required = [];
	let checks = [];
	let checkError = null;

	if (ALLOWED_BASES.has(pr.baseRefName)) {
		const requiredResult = requiredChecksFor(repo, pr.baseRefName);
		if (!requiredResult.ok) {
			checkError = requiredResult.error;
			reasons.push(requiredResult.error);
		} else {
			required = requiredResult.contexts;
			const result = evaluateChecks(required, pr.statusCheckRollup);
			checks = result.states;
			for (const check of checks) {
				if (!check.ok) reasons.push(`required check ${check.context}: ${check.state}`);
			}
		}
	}

	return {
		eligible: reasons.length === 0,
		reasons,
		required,
		checks,
		checkError,
		labels,
	};
}

function printEvaluation(pr, evaluation, dryRun) {
	console.log(`PR #${pr.number}: ${pr.title}`);
	console.log(`  url: ${pr.url ?? "(none)"}`);
	console.log(`  base: ${pr.baseRefName ?? "unknown"}`);
	console.log(`  head: ${pr.headRefName ?? "unknown"} @ ${pr.headRefOid ?? "unknown"}`);
	console.log(`  state: ${pr.state ?? "UNKNOWN"}${pr.isDraft ? " (draft)" : ""}`);
	console.log(
		`  mergeable: ${pr.mergeable ?? "UNKNOWN"}, mergeStateStatus: ${pr.mergeStateStatus ?? "UNKNOWN"}`,
	);
	if (evaluation.labels.length > 0) console.log(`  labels: ${evaluation.labels.join(", ")}`);

	if (evaluation.required.length > 0) {
		console.log("  required checks:");
		for (const check of evaluation.checks) {
			console.log(`    - ${check.context}: ${check.state}`);
		}
	} else if (evaluation.checkError) {
		console.log(`  required checks: unavailable (${evaluation.checkError})`);
	} else {
		console.log("  required checks: none available");
	}

	if (evaluation.eligible) {
		console.log(dryRun ? "  result: eligible, not merged" : "  result: eligible");
	} else {
		console.log(`  result: skipped (${evaluation.reasons.join("; ")})`);
	}
}

function mergeOne(pr, repo) {
	// Re-fetch immediately before merging. A PR can be retargeted from
	// develop/staging to main between evaluation and merge; the base and head
	// must still be the ones that were evaluated.
	const fresh = fetchPr(repo, pr.number);
	if (!fresh.ok) return { ok: false, error: `re-fetch failed: ${fresh.error}` };

	const current = fresh.pr;
	if (current.baseRefName !== pr.baseRefName || current.headRefOid !== pr.headRefOid) {
		return {
			ok: false,
			error: `pull request changed after evaluation (base ${pr.baseRefName} -> ${current.baseRefName}, head ${pr.headRefOid} -> ${current.headRefOid}); refusing`,
		};
	}
	if (!ALLOWED_BASES.has(current.baseRefName)) {
		return {
			ok: false,
			error: `base ${current.baseRefName} is not allowed; main is forbidden`,
		};
	}

	const recheck = evaluatePr(current, repo);
	if (!recheck.eligible) {
		return { ok: false, error: `re-evaluation failed: ${recheck.reasons.join("; ")}` };
	}

	const result = gh([
		"pr",
		"merge",
		String(current.number),
		"--repo",
		repo,
		"--merge",
		"--match-head-commit",
		current.headRefOid,
	]);
	if (!result.ok) return { ok: false, error: shortError(result) };

	const verification = gh([
		"pr",
		"view",
		String(current.number),
		"--repo",
		repo,
		"--json",
		"state,mergeCommit,baseRefName",
	]);
	if (!verification.ok) {
		return { ok: false, error: `merge verification failed: ${shortError(verification)}` };
	}

	let data;
	try {
		data = JSON.parse(verification.stdout);
	} catch {
		return { ok: false, error: "merge verification returned invalid JSON" };
	}
	if (!ALLOWED_BASES.has(data.baseRefName)) {
		return {
			ok: false,
			error: `PR merged into ${data.baseRefName ?? "UNKNOWN"}, not develop/staging`,
		};
	}
	if (data.state !== "MERGED") {
		return { ok: false, error: `PR state is ${data.state ?? "UNKNOWN"}, not MERGED` };
	}
	const commit = data.mergeCommit?.oid;
	if (!commit) return { ok: false, error: "PR is MERGED but no merge commit was reported" };

	console.log(`  merged: ${commit}`);
	return { ok: true, commit };
}

function runSingle(repo, number, dryRun) {
	const fetched = fetchPr(repo, number);
	if (!fetched.ok) {
		console.error(`merge-pr: FAIL PR #${number}: ${fetched.error}`);
		return false;
	}

	const pr = fetched.pr;
	const evaluation = evaluatePr(pr, repo);
	printEvaluation(pr, evaluation, dryRun);

	if (!evaluation.eligible) {
		console.error(`merge-pr: FAIL PR #${number} is not eligible; nothing merged.`);
		return false;
	}
	if (dryRun) {
		console.log(`merge-pr: PASS PR #${number} eligible, not merged.`);
		return true;
	}

	console.log("  merging...");
	const merged = mergeOne(pr, repo);
	if (!merged.ok) {
		console.error(`merge-pr: FAIL PR #${number}: ${merged.error}`);
		return false;
	}
	console.log(`merge-pr: PASS PR #${number} merged ${merged.commit}`);
	return true;
}

function listOpenPrs(repo, base) {
	const result = gh([
		"pr",
		"list",
		"--repo",
		repo,
		"--base",
		base,
		"--state",
		"open",
		"--limit",
		"1000",
		"--json",
		"number,title,url",
	]);
	if (!result.ok) {
		console.error(`merge-pr: FAIL could not list open PRs for ${base}: ${shortError(result)}`);
		return { ok: false, prs: [] };
	}
	try {
		const prs = JSON.parse(result.stdout);
		if (!Array.isArray(prs)) throw new Error("not an array");
		return { ok: true, prs };
	} catch {
		console.error(`merge-pr: FAIL could not parse the open PR list for ${base}.`);
		return { ok: false, prs: [] };
	}
}

function runAll(repo, dryRun) {
	let hadFailure = false;
	let eligible = 0;
	let skipped = 0;
	let merged = 0;
	const seen = new Set();

	for (const base of ["develop", "staging"]) {
		console.log(`Open pull requests targeting ${base}:`);
		const listed = listOpenPrs(repo, base);
		if (!listed.ok) {
			hadFailure = true;
			continue;
		}
		if (listed.prs.length === 0) {
			console.log("  (none)");
			continue;
		}

		for (const item of listed.prs) {
			const number = Number(item.number);
			if (!Number.isInteger(number) || seen.has(number)) continue;
			seen.add(number);

			const fetched = fetchPr(repo, number);
			if (!fetched.ok) {
				console.error(`merge-pr: FAIL PR #${number}: ${fetched.error}`);
				hadFailure = true;
				continue;
			}

			const pr = fetched.pr;
			const evaluation = evaluatePr(pr, repo);
			printEvaluation(pr, evaluation, dryRun);

			// A missing or unreadable branch-protection check list is a
			// configuration failure, not an ordinary skip. Fail closed.
			if (evaluation.checkError) {
				hadFailure = true;
				skipped += 1;
				continue;
			}

			if (!evaluation.eligible) {
				skipped += 1;
				continue;
			}

			eligible += 1;
			if (dryRun) {
				console.log(`merge-pr: PASS PR #${number} eligible, not merged.`);
				continue;
			}

			console.log("  merging...");
			const result = mergeOne(pr, repo);
			if (!result.ok) {
				console.error(`merge-pr: FAIL PR #${number}: ${result.error}`);
				hadFailure = true;
			} else {
				merged += 1;
				console.log(`merge-pr: PASS PR #${number} merged ${result.commit}`);
			}
		}
	}

	console.log(
		`merge-pr: summary eligible=${eligible} skipped=${skipped} merged=${merged} failed=${hadFailure}`,
	);
	return !hadFailure;
}

function main() {
	const parsed = parseArgs(process.argv.slice(2));
	if (!parsed) return true;
	const repo = resolveRepo();
	return parsed.all ? runAll(repo, parsed.dryRun) : runSingle(repo, parsed.number, parsed.dryRun);
}

try {
	const ok = main();
	process.exitCode = ok ? 0 : 1;
} catch (error) {
	console.error(`merge-pr: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
