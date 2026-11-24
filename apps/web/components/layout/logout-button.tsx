import { logoutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";

export function LogoutButton({
	locale,
	label,
	block = false,
}: {
	locale: string;
	label: string;
	block?: boolean;
}) {
	return (
		<form action={logoutAction} className={block ? "w-full" : undefined}>
			<input type="hidden" name="locale" value={locale} />
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
