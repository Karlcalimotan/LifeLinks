"use client";

import { CreateDeviceForm } from "@/components/devices/create-device-form";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useId, useRef } from "react";

export function RegisterTrackerDrawer({
	locale,
	vehicles,
	labels,
}: {
	locale: string;
	vehicles: Array<{ id: string; label: string }>;
	labels: {
		trigger: string;
		title: string;
		body: string;
		close: string;
	};
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();

	return (
		<>
			<Button type="button" size="sm" onClick={() => dialogRef.current?.showModal()}>
				<Plus className="size-4" aria-hidden="true" />
				{labels.trigger}
			</Button>
			<dialog
				ref={dialogRef}
				aria-labelledby={titleId}
				className="m-0 ml-auto h-dvh max-h-none w-full max-w-md border-l border-ink-700 bg-ink-900 p-0 text-fog-100 backdrop:bg-ink-950/80"
				onClick={(event) => {
					if (event.target === dialogRef.current) dialogRef.current?.close();
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") dialogRef.current?.close();
				}}
			>
				<div className="flex h-full flex-col">
					<div className="flex items-start justify-between gap-3 border-b border-ink-700 p-5">
						<div className="min-w-0">
							<h2
								id={titleId}
								className="font-display text-section font-semibold tracking-tight text-fog-50"
							>
								{labels.title}
							</h2>
							<p className="mt-1 text-meta leading-relaxed text-fog-500">{labels.body}</p>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => dialogRef.current?.close()}
							aria-label={labels.close}
						>
							<X className="size-4" aria-hidden="true" />
						</Button>
					</div>
					<div className="flex-1 overflow-y-auto p-5">
						<CreateDeviceForm locale={locale} vehicles={vehicles} />
					</div>
				</div>
			</dialog>
		</>
	);
}
