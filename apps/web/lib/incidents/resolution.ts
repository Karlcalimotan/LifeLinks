/** The incident detail and both resolve paths share one note limit. */
export const MAX_RESOLUTION_LENGTH = 500;

/**
 * Trim a resolution note and bound it to the shared limit. An empty note uses
 * the caller's fallback, so a resolve action always records something honest.
 */
export function boundResolution(note: string, fallback: string): string {
	const trimmed = note.trim();
	return (trimmed || fallback).slice(0, MAX_RESOLUTION_LENGTH);
}
