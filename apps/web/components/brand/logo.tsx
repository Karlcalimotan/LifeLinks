import { cn } from "@/lib/utils";

export function LogoMark({
	className,
	decorative = false,
}: {
	className?: string;
	decorative?: boolean;
}) {
	return (
		<svg
			viewBox="0 0 64 64"
			className={cn("size-9 shrink-0", className)}
			role={decorative ? undefined : "img"}
			aria-label={decorative ? undefined : "LifeLink"}
			aria-hidden={decorative ? true : undefined}
		>
			<path d="M4 0h46l14 14v46a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z" fill="#FF5A1F" />
			<path
				d="M14 20v24h10l5-19 6 25 5-12h10"
				fill="none"
				stroke="#071013"
				strokeWidth="5.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<rect x="46" y="34" width="8" height="8" rx="1" fill="#F4FBFC" />
		</svg>
	);
}

export function Logo({
	className,
	compact = false,
}: {
	className?: string;
	compact?: boolean;
}) {
	return (
		<span className={cn("inline-flex items-center gap-2.5", className)}>
			<LogoMark className={compact ? "size-8" : "size-10"} decorative />
			<span className="flex min-w-0 flex-col">
				<span className="font-display text-[1.35rem] font-semibold leading-none tracking-tight text-fog-50">
					LifeLink
				</span>
				{compact ? null : (
					<span className="mt-1 text-[10px] font-medium text-fog-500">Crash response network</span>
				)}
			</span>
		</span>
	);
}
