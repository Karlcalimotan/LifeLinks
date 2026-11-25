"use client";

import { Logo } from "@/components/brand/logo";
import { Link, usePathname } from "@/i18n/routing";
import { type MemberRoleName, canAdminister } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import {
	Bell,
	Car,
	ChartColumn,
	LayoutDashboard,
	Map as MapIcon,
	MoreHorizontal,
	Radio,
	Settings,
	TriangleAlert,
	X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

const items = [
	{ href: "/dashboard", key: "dashboard", icon: LayoutDashboard, admin: false },
	{ href: "/map", key: "map", icon: MapIcon, admin: false },
	{ href: "/vehicles", key: "vehicles", icon: Car, admin: false },
	{ href: "/incidents", key: "incidents", icon: TriangleAlert, admin: false },
	{ href: "/analytics", key: "analytics", icon: ChartColumn, admin: false },
	{ href: "/notifications", key: "notifications", icon: Bell, admin: false },
	{ href: "/devices", key: "devices", icon: Radio, admin: true },
	{ href: "/settings", key: "settings", icon: Settings, admin: true },
] as const;

const safetyPath = ["Impact detected", "Confirm window", "Driver cancel", "SMS + console"] as const;

function visibleItems(role: MemberRoleName) {
	return items.filter((item) => {
		if (item.admin && !canAdminister(role)) return false;
		if (item.key === "notifications") return role !== "USER";
		return true;
	});
}

export function Sidebar({
	labels,
	role,
}: {
	labels: Record<string, string>;
	role: MemberRoleName;
}) {
	const pathname = usePathname();
	const nav = useTranslations("nav");
	const visible = visibleItems(role);

	return (
		<aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-ink-700 bg-ink-950 lg:flex">
			<div className="h-1 hazard-stripe" aria-hidden="true" />
			<Link href="/dashboard" className="flex items-center px-5 py-5">
				<Logo />
			</Link>

			<nav aria-label={nav("primary")} className="flex flex-1 flex-col gap-0.5 px-3 pt-2">
				{visible.map((item) => {
					const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
					const Icon = item.icon;
					return (
						<Link
							key={item.href}
							href={item.href}
							aria-current={active ? "page" : undefined}
							className={cn(
								"flex items-center gap-3 border-l-2 px-3 py-2.5 text-body transition-colors",
								active
									? "border-signal-500 bg-signal-500/10 text-signal-300"
									: "border-transparent text-fog-500 hover:bg-ink-800 hover:text-fog-100",
							)}
						>
							<Icon className="size-4" />
							{labels[item.key] ?? item.key}
						</Link>
					);
				})}
			</nav>

			<div className="m-3 border border-ink-700 bg-ink-900/60 p-3">
				<p className="text-meta font-medium text-fog-400">Crash path</p>
				<ol className="mt-2 flex flex-col gap-1.5">
					{safetyPath.map((step, index) => (
						<li key={step} className="flex items-baseline gap-2 text-meta text-fog-500">
							<span className="w-4 shrink-0 font-display text-signal-ink">{`0${index + 1}`}</span>
							{step}
						</li>
					))}
				</ol>
			</div>
		</aside>
	);
}

const MAX_TABS = 5;

function isCurrent(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav({
	labels,
	role,
}: {
	labels: Record<string, string>;
	role: MemberRoleName;
}) {
	const pathname = usePathname();
	const nav = useTranslations("nav");
	const common = useTranslations("common");
	const [moreOpen, setMoreOpen] = useState(false);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const visible = visibleItems(role);

	// Keep the bar at five slots so every route stays reachable without a
	// sideways scroll; the tail lives in the More sheet.
	const overflow = visible.length > MAX_TABS ? visible.slice(MAX_TABS - 1) : [];
	const primary = overflow.length > 0 ? visible.slice(0, MAX_TABS - 1) : visible;
	const overflowActive = overflow.some((item) => isCurrent(pathname, item.href));

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		if (moreOpen && !dialog.open) {
			dialog.showModal();
			document.body.style.overflow = "hidden";
			requestAnimationFrame(() => closeRef.current?.focus());
		} else if (!moreOpen && dialog.open) {
			dialog.close();
		}

		return () => {
			document.body.style.overflow = "";
		};
	}, [moreOpen]);

	return (
		<>
			<nav
				aria-label={nav("primary")}
				className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-ink-700 bg-ink-950 px-2 py-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
			>
				{primary.map((item) => {
					const active = isCurrent(pathname, item.href);
					const Icon = item.icon;
					return (
						<Link
							key={item.href}
							href={item.href}
							aria-current={active ? "page" : undefined}
							className={cn(
								"relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-meta leading-tight transition-colors",
								active ? "bg-signal-500/10 text-signal-300" : "text-fog-500 hover:text-fog-100",
							)}
						>
							{active ? (
								<span aria-hidden="true" className="absolute inset-x-2 top-0 h-0.5 bg-signal-500" />
							) : null}
							<Icon className="size-5" aria-hidden="true" />
							<span className="line-clamp-2 w-full text-center">
								{labels[item.key] ?? item.key}
							</span>
						</Link>
					);
				})}

				{overflow.length > 0 ? (
					<button
						type="button"
						onClick={() => setMoreOpen(true)}
						aria-haspopup="dialog"
						aria-expanded={moreOpen}
						aria-current={overflowActive ? "page" : undefined}
						className={cn(
							"relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-meta leading-tight transition-colors",
							overflowActive
								? "bg-signal-500/10 text-signal-300"
								: "text-fog-500 hover:text-fog-100",
						)}
					>
						{overflowActive ? (
							<span aria-hidden="true" className="absolute inset-x-2 top-0 h-0.5 bg-signal-500" />
						) : null}
						<MoreHorizontal className="size-5" aria-hidden="true" />
						<span className="line-clamp-2 w-full text-center">{nav("more")}</span>
					</button>
				) : null}
			</nav>

			<dialog
				ref={dialogRef}
				onClose={() => setMoreOpen(false)}
				onCancel={(event) => {
					event.preventDefault();
					setMoreOpen(false);
				}}
				onMouseDown={(event) => {
					if (event.target === event.currentTarget) setMoreOpen(false);
				}}
				className="fixed inset-x-0 bottom-0 top-auto z-40 m-0 max-h-[80dvh] w-full max-w-none overflow-y-auto rounded-t-overlay border border-ink-700 border-b-0 bg-ink-900 p-0 text-fog-100 shadow-overlay backdrop:bg-ink-950/70 lg:hidden"
			>
				<div className="h-1 hazard-stripe" aria-hidden="true" />
				<div className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
					<p className="font-display text-section font-semibold">{nav("menu")}</p>
					<button
						ref={closeRef}
						type="button"
						onClick={() => setMoreOpen(false)}
						aria-label={common("close")}
						className="grid size-11 place-items-center rounded-control text-fog-500 transition-colors hover:bg-ink-800 hover:text-fog-100"
					>
						<X className="size-5" aria-hidden="true" />
					</button>
				</div>
				<ul className="flex flex-col gap-0.5 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
					{overflow.map((item) => {
						const active = isCurrent(pathname, item.href);
						const Icon = item.icon;
						return (
							<li key={item.href}>
								<Link
									href={item.href}
									onClick={() => setMoreOpen(false)}
									aria-current={active ? "page" : undefined}
									className={cn(
										"flex min-h-11 items-center gap-3 rounded-control px-3 py-2.5 text-body transition-colors",
										active
											? "bg-signal-500/10 text-signal-300"
											: "text-fog-300 hover:bg-ink-800 hover:text-fog-100",
									)}
								>
									<Icon className="size-4" aria-hidden="true" />
									{labels[item.key] ?? item.key}
								</Link>
							</li>
						);
					})}
				</ul>
			</dialog>
		</>
	);
}
