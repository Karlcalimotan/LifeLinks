import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("card-sheen rounded-2xl border border-slate-800/80 shadow-xl", className)}
			{...props}
		/>
	);
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
	return (
		<h2
			className={cn("text-sm font-semibold tracking-wide text-slate-100", className)}
			{...props}
		/>
	);
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
	return <p className={cn("text-xs leading-relaxed text-slate-400", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("flex items-center gap-2 border-t border-slate-800/70 p-5", className)}
			{...props}
		/>
	);
}
