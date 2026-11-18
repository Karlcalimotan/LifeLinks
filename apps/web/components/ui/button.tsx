import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
	primary:
		"bg-signal-500 text-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-signal-400 active:bg-signal-600",
	secondary: "bg-ink-700 text-fog-100 hover:bg-ink-600",
	ghost: "bg-transparent text-fog-300 hover:bg-ink-700/70 hover:text-fog-50",
	danger: "bg-alarm-500 text-fog-50 hover:bg-alarm-400",
	outline:
		"border border-ink-600 bg-transparent text-fog-100 hover:border-signal-500/60 hover:bg-ink-700/60",
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
				"inline-flex items-center justify-center gap-2 rounded font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
				variants[variant],
				sizes[size],
				className,
			)}
			{...props}
		/>
	);
}
