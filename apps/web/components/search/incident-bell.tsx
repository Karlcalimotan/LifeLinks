"use client";

import { IncidentStatusBadge } from "@/components/domain/badges";
import { PushToggle } from "@/components/notifications/push-toggle";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/routing";
import type { AwaitingNotifications } from "@/lib/search/notification-types";
import { refreshAwaitingIncidents } from "@/lib/search/notifications-action";
import { formatDateTime } from "@/lib/utils";
import { Bell, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

export function IncidentBell({
	locale,
	initial,
}: {
	locale: string;
	initial: AwaitingNotifications;
}) {
	const t = useTranslations("search");
	const [open, setOpen] = useState(false);
	const [data, setData] = useState(initial);
	const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node;
			if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setOpen(false);
			buttonRef.current?.focus();
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	async function load() {
		setStatus("loading");
		const result = await refreshAwaitingIncidents();
		if (result.ok) {
			setData(result.data);
			setStatus("idle");
		} else {
			setStatus("error");
		}
	}

	function toggle() {
		if (open) {
			setOpen(false);
			return;
		}
		setOpen(true);
		void load();
	}

	return (
		<div className="relative">
			<button
				ref={buttonRef}
				type="button"
				onClick={toggle}
				aria-expanded={open}
				aria-controls="incident-bell-panel"
				aria-label={t("notificationsAria", { count: data.count })}
				className="inline-flex h-11 w-11 items-center justify-center gap-1.5 rounded-control border border-ink-600 bg-ink-800 px-2 text-fog-300 transition-colors hover:bg-ink-700 hover:text-fog-100 sm:h-8 sm:w-auto"
			>
				<Bell className="size-4" aria-hidden="true" />
				{data.count > 0 ? (
					<span className="text-meta font-medium tabular-nums text-alarm-300">{data.count}</span>
				) : null}
			</button>

			{open ? (
				<section
					ref={panelRef}
					id="incident-bell-panel"
					aria-label={t("notifications")}
					className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)_+_4.5rem)] z-50 max-h-[70dvh] overflow-y-auto rounded-overlay border border-ink-600 bg-ink-900 shadow-overlay sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-72"
				>
					<div className="flex items-start justify-between gap-2 border-b border-ink-700 px-4 py-3">
						<div className="min-w-0">
							<p className="text-body font-medium text-fog-100">{t("notificationsTitle")}</p>
							<p className="text-meta text-fog-500">{t("notificationsHint")}</p>
						</div>
						<span className="shrink-0 text-meta tabular-nums text-fog-500">{data.count}</span>
					</div>

					<div className="max-h-80 overflow-y-auto">
						{status === "loading" && data.items.length === 0 ? (
							<div className="flex flex-col gap-2 p-3" aria-busy="true">
								<Skeleton className="h-12 w-full" />
								<Skeleton className="h-12 w-full" />
								<Skeleton className="h-12 w-full" />
							</div>
						) : null}

						{status === "error" ? (
							<div role="alert" className="flex flex-col items-start gap-2 px-4 py-3">
								<p className="text-body font-medium text-fog-100">{t("notificationsError")}</p>
								<Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
									{t("retry")}
								</Button>
							</div>
						) : null}

						{data.items.length === 0 && status !== "loading" && status !== "error" ? (
							<div className="p-3">
								<EmptyState title={t("notificationsEmpty")} body={t("notificationsEmptyBody")} />
							</div>
						) : null}

						{data.items.length > 0 ? (
							<ul className="divide-y divide-ink-700">
								{data.items.map((incident) => (
									<li key={incident.id}>
										<Link
											href={`/incidents/${incident.id}`}
											onClick={() => setOpen(false)}
											className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-ink-800"
										>
											<span className="min-w-0 flex-1">
												<span className="flex flex-wrap items-center gap-2">
													<span className="truncate text-body font-medium text-fog-100">
														{incident.plateNo}
													</span>
													<IncidentStatusBadge status={incident.status} />
												</span>
												<span className="mt-0.5 block truncate text-meta text-fog-500">
													{incident.driverName ?? t("unassigned")} ·{" "}
													<time dateTime={incident.detectedAt}>
														{formatDateTime(incident.detectedAt, locale)}
													</time>
												</span>
											</span>
											<ChevronRight className="size-4 shrink-0 text-fog-500" aria-hidden="true" />
										</Link>
									</li>
								))}
							</ul>
						) : null}
					</div>

					{status === "loading" && data.items.length > 0 ? (
						<p
							aria-live="polite"
							className="border-t border-ink-700 px-4 py-2 text-meta text-fog-500"
						>
							{t("notificationsLoading")}
						</p>
					) : null}

					<PushToggle />

					<Link
						href="/incidents"
						onClick={() => setOpen(false)}
						className="block border-t border-ink-700 px-4 py-2.5 text-meta text-fog-300 underline hover:text-fog-100"
					>
						{t("viewAll")}
					</Link>
				</section>
			) : null}
		</div>
	);
}
