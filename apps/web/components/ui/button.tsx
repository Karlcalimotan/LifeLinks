import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
	primary:
		"bg-signal-500 text-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-signal-400 active:bg-signal-600",
	secondary: "bg-ink-700 text-fog-100 hover:bg-ink-600",
	ghost: "bg-transparent text-fog-300 hover:bg-ink-700/70 hover:text-fog-50",
	danger: "bg-alarm-400 text-ink-950 hover:bg-alarm-300",
	outline:
		"border border-ink-600 bg-transparent text-fog-100 hover:border-signal-500/60 hover:bg-ink-700/60",
};

const sizes: Record<Size, string> = {
	sm: "h-8 px-3 text-meta",
	md: "h-10 px-4 text-body",
	lg: "h-11 px-5 text-body",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
}

const base =
	"inline-flex items-center justify-center gap-2 rounded-panel font-medium transition-colors disabled:pointer-events-none disabled:opacity-45";

/** Shared button styling for links that must look and size like a button. */
export function buttonClasses({
	variant = "primary",
	size = "md",
	className,
}: {
	variant?: Variant;
	size?: Size;
	className?: string;
} = {}): string {
	return cn(base, variants[variant], sizes[size], className);
}

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
	return <button className={buttonClasses({ variant, size, className })} {...props} />;
}
