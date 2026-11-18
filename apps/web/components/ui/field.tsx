import { cn } from "@/lib/utils";
import type {
	InputHTMLAttributes,
	LabelHTMLAttributes,
	SelectHTMLAttributes,
	TextareaHTMLAttributes,
} from "react";

const field =
	"w-full rounded-[3px] border border-ink-600 bg-ink-950/70 px-3 py-2 text-sm text-fog-100 placeholder:text-fog-500 transition-colors focus:border-signal-500 focus:outline-none focus:ring-1 focus:ring-signal-500/35 disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return <input className={cn(field, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea className={cn(field, "min-h-24 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
	return <select className={cn(field, "h-10", className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: every caller supplies htmlFor
		<label className={cn("text-xs font-medium text-fog-300", className)} {...props} />
	);
}

export function Field({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}
