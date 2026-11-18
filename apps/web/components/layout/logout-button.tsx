import { logoutAction } from "@/lib/actions/auth";
import { LogOut } from "lucide-react";

export function LogoutButton({ locale, label }: { locale: string; label: string }) {
	return (
		<form action={logoutAction}>
			<input type="hidden" name="locale" value={locale} />
			<button
				type="submit"
				className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-700/80 px-2.5 text-xs text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100"
			>
				<LogOut className="size-3.5" />
				{label}
			</button>
		</form>
	);
}
