"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import { type ReactNode, useId, useRef, useState } from "react";

/**
 * A submit button that opens a native confirmation dialog first. Place it
 * inside the form whose action should run. When `confirmText` is set, the
 * confirm button stays disabled until the user types that exact value.
 */
export function ConfirmSubmit({
	message,
	confirmLabel,
	confirmText,
	cancelLabel,
	disabled = false,
	autoFocus = false,
	children,
	variant = "primary",
	size = "sm",
}: {
	message: string;
	confirmLabel?: string;
	confirmText?: string;
	cancelLabel?: string;
	disabled?: boolean;
	autoFocus?: boolean;
	children: ReactNode;
	variant?: ButtonProps["variant"];
	size?: ButtonProps["size"];
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const [value, setValue] = useState("");
	const label = confirmLabel ?? "Confirm";
	const matches =
		confirmText == null || value.trim().toLowerCase() === confirmText.trim().toLowerCase();

	return (
		<>
			<Button
				type="button"
				variant={variant}
				size={size}
				disabled={disabled}
				autoFocus={autoFocus}
				onClick={() => dialogRef.current?.showModal()}
			>
				{children}
			</Button>
			<dialog
				ref={dialogRef}
				aria-labelledby={titleId}
				className="w-[min(28rem,calc(100vw-2rem))] rounded border border-ink-600 bg-ink-900 p-0 text-fog-100 backdrop:bg-ink-950/80"
				onClose={() => setValue("")}
			>
				<div className="flex flex-col gap-4 p-5">
					<h2 id={titleId} className="text-sm font-semibold text-fog-50">
						{label}
					</h2>
					<p className="text-xs leading-relaxed text-fog-400">{message}</p>
					{confirmText != null ? (
						<label className="flex flex-col gap-1.5 text-xs text-fog-300">
							<span>
								Type <span className="font-mono text-fog-100">{confirmText}</span> to confirm.
							</span>
							<input
								className="h-9 rounded-[3px] border border-ink-600 bg-ink-950/70 px-3 font-mono text-sm text-fog-100 focus:border-alarm-500"
								value={value}
								onChange={(event) => setValue(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !matches) event.preventDefault();
								}}
								autoComplete="off"
								spellCheck={false}
							/>
						</label>
					) : null}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => dialogRef.current?.close()}
						>
							{cancelLabel ?? "Cancel"}
						</Button>
						<Button
							type="submit"
							variant={variant === "danger" ? "danger" : "primary"}
							size="sm"
							disabled={!matches}
							onClick={() => {
								// Actions that return state instead of navigating must not leave
								// the dialog covering the result.
								if (confirmText == null) dialogRef.current?.close();
							}}
						>
							{label}
						</Button>
					</div>
				</div>
			</dialog>
		</>
	);
}
