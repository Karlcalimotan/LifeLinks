import { cn } from "@/lib/utils";

export function PageHeader({
	title,
	subtitle,
	actions,
	className,
}: {
	title: string;
	subtitle?: string;
	actions?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
			<div className="min-w-0">
				<h1 className="font-display text-3xl font-semibold leading-none tracking-tight text-fog-50 sm:text-4xl">
					{title}
				</h1>
				{subtitle ? (
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-fog-500">{subtitle}</p>
				) : null}
			</div>
			{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
		</div>
	);
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
	return (
		<div className="rounded border border-dashed border-ink-600 bg-ink-900/40 px-6 py-12 text-center">
			<p className="font-display text-lg font-semibold text-fog-300">{title}</p>
			{body ? <p className="mt-1 text-xs text-fog-500">{body}</p> : null}
		</div>
	);
}
