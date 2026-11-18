import { logoutAction } from "@/lib/actions/auth";
import { LogOut } from "lucide-react";

export function LogoutButton({ locale, label }: { locale: string; label: string }) {
	return (
		<form action={logoutAction}>
			<input type="hidden" name="locale" value={locale} />
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
