import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { LogoutButton } from "@/components/layout/logout-button";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import type { MemberRoleName } from "@/lib/auth/session";

function roleTone(role: MemberRoleName) {
	switch (role) {
		case "OWNER":
			return "info" as const;
		case "ADMIN":
			return "success" as const;
		case "OPERATOR":
			return "warning" as const;
		default:
			return "muted" as const;
	}
}

export function AppShell({
	locale,
	user,
	org,
	role,
	navLabels,
	signOutLabel,
	children,
}: {
	locale: string;
	user: { name: string; email: string };
	org: { name: string; slug: string };
	role: MemberRoleName;
	navLabels: Record<string, string>;
	signOutLabel: string;
	children: React.ReactNode;
}) {
	const initials = user.name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");

	return (
		<div className="min-h-screen">
			<Sidebar labels={navLabels} />
			<div className="lg:pl-64">
				<header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-800/70 bg-[#060b14]/80 px-4 py-3 backdrop-blur md:px-6">
					<div className="min-w-0">
						<p className="truncate text-[10px] uppercase tracking-[0.2em] text-slate-500">
							{org.name}
						</p>
						<p className="truncate text-sm font-medium text-slate-200">{user.email}</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Badge tone={roleTone(role)}>{role}</Badge>
						<div className="hidden items-center gap-2 sm:flex">
							<LocaleSwitcher />
							<LogoutButton locale={locale} label={signOutLabel} />
						</div>
						<span className="grid size-8 place-items-center rounded-full border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-300">
							{initials || "LL"}
						</span>
					</div>
				</header>
				<main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 md:px-6 lg:pb-10">
					{children}
				</main>
			</div>
			<MobileNav labels={navLabels} />
		</div>
	);
}
