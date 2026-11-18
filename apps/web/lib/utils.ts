import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
