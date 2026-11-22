#!/usr/bin/env node
/**
 * Read-only overlap preflight for agent work.
 *
 * Lists J-Akiru5's open LifeLinks issues and pull requests so the caller can
 * coordinate instead of duplicating work.
 *
 *   node scripts/overlap-check.mjs
 *
 * On an overlapping decision, J-Akiru5's decision takes priority.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const AUTHOR = "J-Akiru5";

function gh(args) {
	const result = spawnSync("gh", args, {
		cwd: ROOT,
		encoding: "utf8",
		windowsHide: true,
		maxBuffer: 8 * 1024 * 1024,
	});
	return {
		ok: !result.error && result.status === 0,
		stdout: typeof result.stdout === "string" ? result.stdout.trim() : "",
		stderr: typeof result.stderr === "string" ? result.stderr.trim() : "",
		error: result.error ?? null,
	};
}

function fail(message) {
	console.error(`overlap-check: ${message}`);
	process.exitCode = 1;
}

function printIssues(label, items) {
	console.log(`${label}:`);
	if (items.length === 0) {
		console.log("  (none)");
		return;
	}
	for (const issue of items) {
		const labels = (issue.labels ?? [])
			.map((label) => label.name)
			.filter(Boolean)
			.join(", ");
		const assignees = (issue.assignees ?? [])
			.map((user) => user.login)
			.filter(Boolean)
			.join(", ");
		console.log(`  #${issue.number} ${issue.title}`);
		if (labels) console.log(`    labels: ${labels}`);
		if (assignees) console.log(`    assignees: ${assignees}`);
	}
}

function main() {
	const repo = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
	if (!repo.ok || !repo.stdout) {
		fail(
			`cannot resolve the repository through gh: ${repo.stderr || repo.error?.message || "unknown error"}`,
		);
		return;
	}
	const name = repo.stdout.split(/\r?\n/)[0].trim();

	const authored = gh([
		"issue",
		"list",
		"--repo",
		name,
		"--state",
		"open",
		"--author",
		AUTHOR,
		"--json",
		"number,title,labels,assignees",
	]);
	const assigned = gh([
		"issue",
		"list",
		"--repo",
		name,
		"--state",
		"open",
		"--assignee",
		AUTHOR,
		"--json",
		"number,title,labels,assignees",
	]);
	const prs = gh([
		"pr",
		"list",
		"--repo",
		name,
		"--state",
		"open",
		"--author",
		AUTHOR,
		"--json",
		"number,title,baseRefName,headRefName",
	]);

	if (!authored.ok || !assigned.ok || !prs.ok) {
		fail("cannot list J-Akiru5's open work; check gh authentication and repository access.");
		return;
	}

	let authoredItems;
	let assignedItems;
	let prItems;
	try {
		authoredItems = JSON.parse(authored.stdout);
		assignedItems = JSON.parse(assigned.stdout);
		prItems = JSON.parse(prs.stdout);
	} catch {
		fail("gh returned invalid JSON.");
		return;
	}

	const byNumber = new Map();
	for (const issue of [...authoredItems, ...assignedItems]) {
		byNumber.set(issue.number, issue);
	}
	const issues = [...byNumber.values()].sort((a, b) => a.number - b.number);
	prItems.sort((a, b) => a.number - b.number);

	console.log(`Open LifeLinks work by ${AUTHOR}:`);
	printIssues("Issues", issues);
	console.log("Pull requests:");
	if (prItems.length === 0) {
		console.log("  (none)");
	} else {
		for (const pr of prItems) {
			console.log(`  #${pr.number} ${pr.title}`);
			console.log(`    ${pr.headRefName} -> ${pr.baseRefName}`);
		}
	}
	console.log("");
	console.log("Review these before creating an issue or starting work.");
	console.log("On an overlap, J-Akiru5's decision takes priority; comment and align.");
}

main();
