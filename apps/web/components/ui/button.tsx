import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
	primary:
		"bg-brand-500 text-slate-950 hover:bg-brand-400 shadow-[0_0_24px_-6px_rgba(34,211,238,0.6)]",
	secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700",
	ghost: "bg-transparent text-slate-300 hover:bg-slate-800/70 hover:text-white",
	danger: "bg-rose-500/90 text-white hover:bg-rose-500",
	outline: "border border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800/60",
};

const sizes: Record<Size, string> = {
	sm: "h-8 px-3 text-xs",
	md: "h-10 px-4 text-sm",
	lg: "h-11 px-5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
}

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
	return (
		<button
			className={cn(
				"inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
				variants[variant],
				sizes[size],
				className,
			)}
			{...props}
		/>
	);
}
