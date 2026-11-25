import { LogoMark } from "@/components/brand/logo";
import { AccountMenu } from "@/components/layout/account-menu";
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
	accountLabel,
	languageLabel,
	closeLabel,
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
	accountLabel: string;
	languageLabel: string;
	closeLabel: string;
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
		<span className="hidden size-8 place-items-center rounded-control border border-ink-600 bg-ink-800 font-display text-body font-semibold text-fog-100 sm:grid">
			{initials || "LL"}
		</span>
	);

	return (
		<div className="min-h-dvh">
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-panel focus:border focus:border-signal-500 focus:bg-ink-800 focus:px-3 focus:py-2 focus:text-body focus:text-fog-50"
			>
				{skipLabel}
			</a>
			<Sidebar labels={navLabels} role={role} />
			<div className="lg:pl-[248px]">
				<header className="sticky top-0 z-20 border-b border-ink-700 bg-ink-950 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6">
					<div className="flex items-center justify-between gap-2 sm:gap-3">
						<div className="flex min-w-0 items-center gap-2.5">
							<LogoMark className="size-7 shrink-0 sm:hidden" decorative />
							<div className="min-w-0">
								<p
									className="truncate text-body font-medium text-fog-100 sm:text-meta sm:font-normal sm:text-fog-500"
									title={org.name}
								>
									{org.name}
								</p>
								<p className="truncate text-meta text-fog-500 sm:hidden">{roleLabel}</p>
								<p className="hidden truncate text-body font-medium text-fog-100 sm:block">
									{user.email}
								</p>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-1 sm:gap-2">
							<CommandPalette role={role} />
							<IncidentBell locale={locale} initial={awaiting} />
							<span className="hidden sm:inline-flex">{roleBadge}</span>
							<div className="hidden items-center gap-2 sm:flex">
								<ThemeToggle initialPreference={themePreference} labels={themeLabels} />
								<LocaleSwitcher label={languageLabel} />
								<LogoutButton locale={locale} label={signOutLabel} />
							</div>
							{avatar}
							<AccountMenu
								initials={initials}
								name={user.name}
								email={user.email}
								roleLabel={roleLabel}
								roleTone={roleTone(role)}
								locale={locale}
								themePreference={themePreference}
								themeLabels={themeLabels}
								languageLabel={languageLabel}
								accountLabel={accountLabel}
								closeLabel={closeLabel}
								signOutLabel={signOutLabel}
							/>
						</div>
					</div>
				</header>
				<main
					id="main"
					tabIndex={-1}
					className="mx-auto w-full max-w-7xl px-4 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] pt-6 md:px-6 lg:pb-10"
				>
					{children}
				</main>
			</div>
			<MobileNav labels={navLabels} role={role} />
		</div>
	);
}
