import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			aria-hidden="true"
			className={cn("rounded-panel bg-ink-700/60 motion-safe:animate-pulse", className)}
			{...props}
		/>
	);
}
