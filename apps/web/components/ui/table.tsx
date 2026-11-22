import { cn } from "@/lib/utils";
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
	return (
		<div className="w-full overflow-x-auto">
			<table className={cn("w-full caption-bottom text-body", className)} {...props} />
		</div>
	);
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
	return <thead className={cn("border-b border-ink-700", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
	return <tbody className={cn("divide-y divide-ink-700/70", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
	return (
		<tr
			className={cn(
				"border-l-2 border-transparent transition-colors hover:border-signal-500/70 hover:bg-ink-700/40",
				className,
			)}
			{...props}
		/>
	);
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
	return (
		<th
			className={cn("px-4 py-2.5 text-left text-meta font-medium text-fog-500", className)}
			{...props}
		/>
	);
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
	return (
		<td className={cn("px-4 py-3 align-middle text-fog-300 tabular-nums", className)} {...props} />
	);
}
