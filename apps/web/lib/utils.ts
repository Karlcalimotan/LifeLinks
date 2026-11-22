import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The six-step type scale uses `text-{size}` names that are not Tailwind's
 * defaults. Without registering them, tailwind-merge classifies `text-body`
 * as a text colour and drops a real colour such as `text-ink-950` from the
 * same element. Keep this list in sync with `--text-*` in globals.css.
 */
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-size": [{ text: ["meta", "body", "emphasis", "section", "title", "display"] }],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatDateTime(value: Date | string | null | undefined, locale = "en"): string {
	if (!value) return "—";
	const date = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat(locale === "tl" ? "fil-PH" : "en-PH", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Asia/Manila",
	}).format(date);
}

export function formatRelative(value: Date | string | null | undefined): string {
	if (!value) return "never";
	const date = typeof value === "string" ? new Date(value) : value;
	const diffMs = Date.now() - date.getTime();
	if (Number.isNaN(diffMs)) return "never";
	if (diffMs < 0) return "just now";
	const seconds = Math.round(diffMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return `${days}d ago`;
}

export function formatCoord(value: number | null | undefined): string {
	if (value == null || Number.isNaN(value)) return "—";
	return value.toFixed(6);
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * A `tel:` link for a stored free-text phone number. Spaces and punctuation are
 * removed, a leading `+` is kept and a value with fewer than seven digits is
 * rejected instead of producing an unusable link.
 */
export function telHref(phone: string | null | undefined): string | null {
	if (!phone) return null;
	const trimmed = phone.trim();
	const digits = trimmed.replace(/\D/g, "");
	if (digits.length < 7) return null;
	return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
