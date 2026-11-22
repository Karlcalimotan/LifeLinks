export interface AwaitingIncident {
	id: string;
	plateNo: string;
	driverName: string | null;
	status: string;
	/** ISO string so the value survives the server/client boundary. */
	detectedAt: string;
}

export interface AwaitingNotifications {
	count: number;
	items: AwaitingIncident[];
}
