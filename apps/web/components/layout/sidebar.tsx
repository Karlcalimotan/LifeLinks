"use client";

import { Link, usePathname } from "@/i18n/routing";
import { type MemberRoleName, canAdminister } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { Car, LayoutDashboard, Radio, Settings, TriangleAlert } from "lucide-react";

const items = [
	{ href: "/dashboard", key: "dashboard", icon: LayoutDashboard, admin: false },
	{ href: "/vehicles", key: "vehicles", icon: Car, admin: false },
	{ href: "/incidents", key: "incidents", icon: TriangleAlert, admin: false },
	{ href: "/devices", key: "devices", icon: Radio, admin: true },
	{ href: "/settings", key: "settings", icon: Settings, admin: true },
] as const;

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
		<aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-800/70 bg-slate-950/80 backdrop-blur lg:flex">
			<Link href="/dashboard" className="flex items-center gap-3 px-6 py-6">
				<span className="grid size-9 place-items-center rounded-xl bg-brand-500 text-sm font-black text-slate-950">
					LL
				</span>
				<span>
					<span className="block text-sm font-semibold tracking-wide text-white">LifeLink</span>
					<span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">
						Fleet safety
					</span>
				</span>
			</Link>

			<nav className="flex flex-1 flex-col gap-1 px-3">
				{visible.map((item) => {
					const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
					const Icon = item.icon;
					return (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
								active
									? "bg-brand-500/10 text-brand-300"
									: "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
							)}
						>
							<Icon className="size-4" />
							{labels[item.key] ?? item.key}
						</Link>
					);
				})}
			</nav>

			<div className="m-3 rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
				<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
					Safety path
				</p>
				<p className="mt-1 text-xs leading-relaxed text-slate-400">
					Impact → confirm → 15 s cancel window → SMS + dashboard alert.
				</p>
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
		<nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-800/80 bg-slate-950/95 px-2 py-1 backdrop-blur lg:hidden">
			{visible.map((item) => {
				const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
				const Icon = item.icon;
				return (
					<Link
						key={item.href}
						href={item.href}
						className={cn(
							"flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px]",
							active ? "text-brand-300" : "text-slate-500",
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
