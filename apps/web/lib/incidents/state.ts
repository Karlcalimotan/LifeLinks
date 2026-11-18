export type ImpactStatusName =
	| "SUSPECTED"
	| "CONFIRMED"
	| "ACKNOWLEDGED"
	| "CANCELLED"
	| "RESOLVED"
	| "FALSE_ALARM";

const TRANSITIONS: Record<ImpactStatusName, ImpactStatusName[]> = {
	SUSPECTED: ["CONFIRMED", "ACKNOWLEDGED", "CANCELLED", "FALSE_ALARM"],
	CONFIRMED: ["ACKNOWLEDGED", "RESOLVED", "CANCELLED", "FALSE_ALARM"],
	ACKNOWLEDGED: ["RESOLVED", "CANCELLED", "FALSE_ALARM"],
	CANCELLED: ["FALSE_ALARM", "RESOLVED"],
	RESOLVED: [],
	FALSE_ALARM: [],
};

export function canTransition(from: ImpactStatusName, to: ImpactStatusName): boolean {
	return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: ImpactStatusName): boolean {
	return TRANSITIONS[status].length === 0;
}
