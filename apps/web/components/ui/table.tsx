import { cn } from "@/lib/utils";
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
	return (
		<div className="w-full overflow-x-auto">
			<table className={cn("w-full caption-bottom text-sm", className)} {...props} />
		</div>
	);
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
	return <thead className={cn("border-b border-slate-800/80", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
	return <tbody className={cn("divide-y divide-slate-800/60", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
	return <tr className={cn("transition-colors hover:bg-slate-900/40", className)} {...props} />;
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
	return (
		<th
			className={cn(
				"px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500",
				className,
			)}
			{...props}
		/>
	);
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
	return <td className={cn("px-4 py-3 align-middle text-slate-300", className)} {...props} />;
}
