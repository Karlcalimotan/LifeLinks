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
		<div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}>
			<div>
				<h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
				{subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
			</div>
			{actions ? <div className="flex items-center gap-2">{actions}</div> : null}
		</div>
	);
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
	return (
		<div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/20 px-6 py-12 text-center">
			<p className="text-sm font-medium text-slate-300">{title}</p>
			{body ? <p className="mt-1 text-xs text-slate-500">{body}</p> : null}
		</div>
	);
}
