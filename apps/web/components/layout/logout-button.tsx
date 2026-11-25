"use client";

import { logoutAction } from "@/lib/actions/auth";
import { currentPushEndpoint } from "@/lib/push/client";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The logout form carries this browser's push endpoint so the server can revoke
 * exactly that subscription. The hidden field starts empty: a browser without a
 * service worker, or with JavaScript disabled, falls back to the user-agent
 * match in the logout action. Revocation never blocks sign out.
 */
export function LogoutButton({
	locale,
	label,
	block = false,
}: {
	locale: string;
	label: string;
	block?: boolean;
}) {
	const [endpoint, setEndpoint] = useState("");

	useEffect(() => {
		let cancelled = false;
		const container =
			typeof navigator !== "undefined" && "serviceWorker" in navigator
				? navigator.serviceWorker
				: undefined;
		void currentPushEndpoint(container).then((value) => {
			if (!cancelled && value) setEndpoint(value);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<form action={logoutAction} className={block ? "w-full" : undefined}>
			<input type="hidden" name="locale" value={locale} />
			<input type="hidden" name="pushEndpoint" value={endpoint} />
			<button
				type="submit"
				className={cn(
					"inline-flex items-center gap-2 rounded border border-ink-600/80 text-fog-500 transition-colors hover:border-ink-600 hover:text-fog-100",
					block ? "h-11 w-full justify-start px-3 text-body" : "h-11 px-2.5 text-xs sm:h-8",
				)}
			>
				<LogOut className="size-3.5" />
				{label}
			</button>
		</form>
	);
}
