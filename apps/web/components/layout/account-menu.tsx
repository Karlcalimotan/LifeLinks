"use client";

import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { LogoutButton } from "@/components/layout/logout-button";
import { type ThemeLabels, ThemeToggle } from "@/components/layout/theme-toggle";
import { Badge } from "@/components/ui/badge";
import type { ThemePreference } from "@/lib/theme";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function AccountMenu({
	initials,
	name,
	email,
	roleLabel,
	roleTone,
	locale,
	themePreference,
	themeLabels,
	languageLabel,
	accountLabel,
	closeLabel,
	signOutLabel,
}: {
	initials: string;
	name: string;
	email: string;
	roleLabel: string;
	roleTone: "success" | "warning" | "info";
	locale: string;
	themePreference: ThemePreference;
	themeLabels: ThemeLabels;
	languageLabel: string;
	accountLabel: string;
	closeLabel: string;
	signOutLabel: string;
}) {
	const [open, setOpen] = useState(false);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		if (open && !dialog.open) {
			dialog.showModal();
			document.body.style.overflow = "hidden";
			requestAnimationFrame(() => closeRef.current?.focus());
		} else if (!open && dialog.open) {
			dialog.close();
		}

		return () => {
			document.body.style.overflow = "";
		};
	}, [open]);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-label={accountLabel}
				className="grid size-11 place-items-center rounded-control border border-ink-600 bg-ink-800 font-display text-body font-semibold text-fog-100 sm:hidden"
			>
				{initials || "LL"}
			</button>

			<dialog
				ref={dialogRef}
				onClose={() => setOpen(false)}
				onCancel={(event) => {
					event.preventDefault();
					setOpen(false);
				}}
				onMouseDown={(event) => {
					if (event.target === event.currentTarget) setOpen(false);
				}}
				className="fixed inset-x-0 bottom-0 top-auto z-50 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-overlay border border-ink-700 border-b-0 bg-ink-900 p-0 text-fog-100 shadow-overlay backdrop:bg-ink-950/70 sm:hidden"
			>
				<div className="h-1 hazard-stripe" aria-hidden="true" />

				<div className="flex items-start justify-between gap-3 border-b border-ink-700 p-5 pb-4">
					<div className="min-w-0">
						<p className="truncate font-display text-section font-semibold">{name}</p>
						<p className="truncate text-meta text-fog-500">{email}</p>
					</div>
					<button
						ref={closeRef}
						type="button"
						onClick={() => setOpen(false)}
						aria-label={closeLabel}
						className="grid size-11 shrink-0 place-items-center rounded-control text-fog-500 transition-colors hover:bg-ink-800 hover:text-fog-100"
					>
						<X className="size-5" aria-hidden="true" />
					</button>
				</div>

				<div className="flex flex-col gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
					<Badge tone={roleTone}>{roleLabel}</Badge>

					<div className="flex items-center justify-between gap-3">
						<span className="text-body text-fog-300">{themeLabels.label}</span>
						<ThemeToggle size="md" initialPreference={themePreference} labels={themeLabels} />
					</div>

					<div className="flex items-center justify-between gap-3">
						<span className="text-body text-fog-300">{languageLabel}</span>
						<LocaleSwitcher label={languageLabel} />
					</div>

					<LogoutButton locale={locale} label={signOutLabel} block />
				</div>
			</dialog>
		</>
	);
}
