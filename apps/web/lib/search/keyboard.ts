/** `/` must never steal a keystroke meant for a text field. */
export function isTypingTarget(target: EventTarget | null): boolean {
	if (!target || typeof target !== "object") return false;
	const element = target as HTMLElement;
	const tag = element.tagName?.toLowerCase();
	return (
		tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable === true
	);
}

/** Wrap-around index for the palette's active option. */
export function nextActiveIndex(current: number, step: number, count: number): number {
	if (count <= 0) return -1;
	if (current < 0) return step > 0 ? 0 : count - 1;
	return (((current + step) % count) + count) % count;
}
