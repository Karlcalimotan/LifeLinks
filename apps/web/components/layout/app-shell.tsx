import { LogoMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { LogoutButton } from "@/components/layout/logout-button";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import type { MemberRoleName } from "@/lib/auth/roles";

function roleTone(role: MemberRoleName) {
	switch (role) {
		case "ADMIN":
			return "success" as const;
		case "RESPONDER":
			return "warning" as const;
		default:
			return "info" as const;
	}
}

export function AppShell({
	locale,
	user,
	org,
	role,
	roleLabel,
	navLabels,
	signOutLabel,
	children,
}: {
	locale: string;
	user: { name: string; email: string };
	org: { name: string; slug: string };
	role: MemberRoleName;
	roleLabel: string;
	navLabels: Record<string, string>;
	signOutLabel: string;
	children: React.ReactNode;
}) {
	const initials = user.name
		.split(/\s+/)
		.filter((part) => /^[A-Za-z]/.test(part))
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");

	const roleBadge = <Badge tone={roleTone(role)}>{roleLabel}</Badge>;
	const avatar = (
		<span className="grid size-8 place-items-center rounded-[3px] border border-ink-600 bg-ink-800 font-display text-sm font-semibold text-fog-100">
			{initials || "LL"}
		</span>
	);

	return (
		<div className="min-h-screen">
			<Sidebar labels={navLabels} role={role} />
			<div className="lg:pl-[248px]">
				<header className="sticky top-0 z-20 border-b border-ink-700 bg-ink-950/85 px-4 py-3 backdrop-blur md:px-6">
					<div className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-2.5">
							<LogoMark className="size-7 shrink-0 sm:hidden" decorative />
							<div className="min-w-0">
								<p className="truncate text-[11px] text-fog-500">{org.name}</p>
								<p className="truncate text-sm font-medium text-fog-100">{user.email}</p>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<span className="hidden sm:inline-flex">{roleBadge}</span>
							<div className="hidden items-center gap-2 sm:flex">
								<LocaleSwitcher />
								<LogoutButton locale={locale} label={signOutLabel} />
							</div>
							{avatar}
						</div>
					</div>
					<div className="mt-2 flex items-center justify-between gap-2 border-t border-ink-700/70 pt-2 sm:hidden">
						{roleBadge}
						<div className="flex items-center gap-2">
							<LocaleSwitcher />
							<LogoutButton locale={locale} label={signOutLabel} />
						</div>
					</div>
				</header>
				<main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 md:px-6 lg:pb-10">
					{children}
				</main>
			</div>
			<MobileNav labels={navLabels} role={role} />
		</div>
	);
}
