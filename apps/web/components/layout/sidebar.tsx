"use client";

import { Logo } from "@/components/brand/logo";
import { Link, usePathname } from "@/i18n/routing";
import { type MemberRoleName, canAdminister } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { Car, ChartColumn, LayoutDashboard, Radio, Settings, TriangleAlert } from "lucide-react";

const items = [
	{ href: "/dashboard", key: "dashboard", icon: LayoutDashboard, admin: false },
	{ href: "/vehicles", key: "vehicles", icon: Car, admin: false },
	{ href: "/incidents", key: "incidents", icon: TriangleAlert, admin: false },
	{ href: "/analytics", key: "analytics", icon: ChartColumn, admin: false },
	{ href: "/devices", key: "devices", icon: Radio, admin: true },
	{ href: "/settings", key: "settings", icon: Settings, admin: true },
] as const;

const safetyPath = ["Impact detected", "Confirm window", "Driver cancel", "SMS + console"] as const;

function visibleItems(role: MemberRoleName) {
	return items.filter((item) => !item.admin || canAdminister(role));
}

export function Sidebar({
	labels,
	role,
}: {
	labels: Record<string, string>;
	role: MemberRoleName;
}) {
	const pathname = usePathname();
	const visible = visibleItems(role);

	return (
		<aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-ink-700 bg-ink-950 lg:flex">
			<div className="h-1 hazard-stripe" aria-hidden="true" />
			<Link href="/dashboard" className="flex items-center px-5 py-5">
				<Logo />
			</Link>

			<nav className="flex flex-1 flex-col gap-0.5 px-3 pt-2">
				{visible.map((item) => {
					const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
					const Icon = item.icon;
					return (
						<Link
							key={item.href}
							href={item.href}
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
							<span className="w-4 shrink-0 font-display text-signal-500">{`0${index + 1}`}</span>
							{step}
						</li>
					))}
				</ol>
			</div>
		</aside>
	);
}

export function MobileNav({
	labels,
	role,
}: {
	labels: Record<string, string>;
	role: MemberRoleName;
}) {
	const pathname = usePathname();
	const visible = visibleItems(role);

	return (
		<nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-700 bg-ink-950 px-2 py-1 lg:hidden">
			{visible.map((item) => {
				const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
				const Icon = item.icon;
				return (
					<Link
						key={item.href}
						href={item.href}
						className={cn(
							"flex flex-1 flex-col items-center gap-1 rounded-control px-1 py-2 text-meta",
							active ? "text-signal-300" : "text-fog-500",
						)}
					>
						<Icon className="size-4" />
						{labels[item.key] ?? item.key}
					</Link>
				);
			})}
		</nav>
	);
}
