"use client";

import { logoutAction } from "@/lib/actions/auth";
import { currentPushEndpoint } from "@/lib/push/client";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The logout form carries this browser's push endpoint so the server can revoke
 * exactly that subscription. The hidden field starts empty: a browser without a
 * service worker, or with JavaScript disabled, falls back to the user-agent
 * match in the logout action. Revocation never blocks sign out.
 */
export function LogoutButton({ locale, label }: { locale: string; label: string }) {
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
		<form action={logoutAction}>
			<input type="hidden" name="locale" value={locale} />
			<input type="hidden" name="pushEndpoint" value={endpoint} />
			<button
				type="submit"
				className="inline-flex h-8 items-center gap-2 rounded border border-ink-600/80 px-2.5 text-xs text-fog-500 transition-colors hover:border-ink-600 hover:text-fog-100"
			>
				<LogOut className="size-3.5" />
				{label}
			</button>
		</form>
	);
}
