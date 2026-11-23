import { LogoMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { LogoutButton } from "@/components/layout/logout-button";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { type ThemeLabels, ThemeToggle } from "@/components/layout/theme-toggle";
import { CommandPalette } from "@/components/search/command-palette";
import { IncidentBell } from "@/components/search/incident-bell";
import { Badge } from "@/components/ui/badge";
import type { MemberRoleName } from "@/lib/auth/roles";
import { loadAwaitingIncidents } from "@/lib/search/notifications";
import type { ThemePreference } from "@/lib/theme";

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

export async function AppShell({
	locale,
	user,
	org,
	role,
	roleLabel,
	navLabels,
	signOutLabel,
	skipLabel,
	themePreference,
	themeLabels,
	children,
}: {
	locale: string;
	user: { id: string; name: string; email: string };
	org: { id: string; name: string; slug: string };
	role: MemberRoleName;
	roleLabel: string;
	navLabels: Record<string, string>;
	signOutLabel: string;
	skipLabel: string;
	themePreference: ThemePreference;
	themeLabels: ThemeLabels;
	children: React.ReactNode;
}) {
	const awaiting: Awaited<ReturnType<typeof loadAwaitingIncidents>> = { count: 0, items: [] };
	try {
		Object.assign(
			awaiting,
			await loadAwaitingIncidents({
				role,
				orgId: org.id,
				userId: user.id,
			}),
		);
	} catch {
		// The bell is secondary: a failed count must not take down every page.
	}

	const initials = user.name
		.split(/\s+/)
		.filter((part) => /^[A-Za-z]/.test(part))
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");

	const roleBadge = <Badge tone={roleTone(role)}>{roleLabel}</Badge>;
	const avatar = (
		<span className="grid size-8 place-items-center rounded-control border border-ink-600 bg-ink-800 font-display text-body font-semibold text-fog-100">
			{initials || "LL"}
		</span>
	);

	return (
		<div className="min-h-screen">
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-panel focus:border focus:border-signal-500 focus:bg-ink-800 focus:px-3 focus:py-2 focus:text-body focus:text-fog-50"
			>
				{skipLabel}
			</a>
			<Sidebar labels={navLabels} role={role} />
			<div className="lg:pl-[248px]">
				<header className="sticky top-0 z-20 border-b border-ink-700 bg-ink-950 px-4 py-3 md:px-6">
					<div className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-2.5">
							<LogoMark className="size-7 shrink-0 sm:hidden" decorative />
							<div className="min-w-0">
								<p className="truncate text-meta text-fog-500">{org.name}</p>
								<p className="truncate text-body font-medium text-fog-100">{user.email}</p>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<CommandPalette role={role} />
							<IncidentBell locale={locale} initial={awaiting} />
							<span className="hidden sm:inline-flex">{roleBadge}</span>
							<div className="hidden items-center gap-2 sm:flex">
								<ThemeToggle initialPreference={themePreference} labels={themeLabels} />
								<LocaleSwitcher />
								<LogoutButton locale={locale} label={signOutLabel} />
							</div>
							{avatar}
						</div>
					</div>
					<div className="mt-2 flex items-center justify-between gap-2 border-t border-ink-700/70 pt-2 sm:hidden">
						{roleBadge}
						<div className="flex items-center gap-2">
							<ThemeToggle initialPreference={themePreference} labels={themeLabels} />
							<LocaleSwitcher />
							<LogoutButton locale={locale} label={signOutLabel} />
						</div>
					</div>
				</header>
				<main
					id="main"
					tabIndex={-1}
					className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 md:px-6 lg:pb-10"
				>
					{children}
				</main>
			</div>
			<MobileNav labels={navLabels} role={role} />
		</div>
	);
}
