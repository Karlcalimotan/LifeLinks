/**
 * Pure issue-first policy rules shared by the CLI and the unit tests.
 *
 * A pull request must link an issue with one of:
 *   Closes #12, Fixes #12, Refs #12, Part of #12
 *
 * Bots and the labels `release` / `promotion` are exempt.
 */

const BOT_AUTHORS = new Set([
	"dependabot[bot]",
	"renovate[bot]",
	"github-actions[bot]",
	"dependabot",
	"renovate",
	"github-actions",
]);

const EXEMPT_LABELS = new Set(["release", "promotion"]);

export function isBotAuthor(author) {
	if (typeof author !== "string") return false;
	const normalized = author.trim().toLowerCase();
	if (!normalized) return false;
	return normalized.endsWith("[bot]") || BOT_AUTHORS.has(normalized);
}

export function normalizeLabels(labels) {
	const values = Array.isArray(labels)
		? labels
		: typeof labels === "string"
			? labels.split(",")
			: [];
	return values
		.filter((label) => typeof label === "string")
		.map((label) => label.trim().toLowerCase())
		.filter(Boolean);
}

export function findIssueReferences(text) {
	if (typeof text !== "string" || text.length === 0) return [];
	const pattern = /\b(?:closes|fixes|refs|part\s+of)\s+#(\d+)\b/gi;
	const numbers = new Set();
	for (const match of text.matchAll(pattern)) {
		const number = Number.parseInt(match[1], 10);
		if (Number.isInteger(number) && number > 0) numbers.add(number);
	}
	return [...numbers].sort((a, b) => a - b);
}

export function evaluateIssuePolicy({ title = "", body = "", author = "", labels = [] } = {}) {
	if (isBotAuthor(author)) {
		return { ok: true, exempt: "bot", numbers: [] };
	}

	const normalizedLabels = normalizeLabels(labels);
	if (normalizedLabels.some((label) => EXEMPT_LABELS.has(label))) {
		return { ok: true, exempt: "label", numbers: [] };
	}

	const numbers = findIssueReferences(`${title ?? ""}\n${body ?? ""}`);
	if (numbers.length === 0) {
		return {
			ok: false,
			errors: [
				"No issue reference found. Create the issue first and link it with Closes #N, Fixes #N, Refs #N or Part of #N.",
			],
		};
	}

	return { ok: true, numbers };
}
