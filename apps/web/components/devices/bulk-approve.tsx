"use client";

import { Button } from "@/components/ui/button";
import { type BulkApproveState, bulkApproveDevicesAction } from "@/lib/actions/devices";
import { BULK_APPROVE_MAX } from "@/lib/device/bulk";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
	type FormEvent,
	type ReactNode,
	createContext,
	useActionState,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

interface BulkSelection {
	pendingIds: readonly string[];
	selected: ReadonlySet<string>;
	toggle: (id: string) => void;
	toggleAll: () => void;
}

const BulkSelectionContext = createContext<BulkSelection | null>(null);
const initialState: BulkApproveState = { ok: false };
const checkboxClass = "size-4 rounded-control border-ink-600 bg-ink-950 accent-signal-500";

export function BulkApproveProvider({
	locale,
	pendingIds,
	children,
}: {
	locale: string;
	pendingIds: readonly string[];
	children: ReactNode;
}) {
	const t = useTranslations("devices");
	const tCommon = useTranslations("common");
	const [state, formAction, pending] = useActionState(bulkApproveDevicesAction, initialState);
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const formRef = useRef<HTMLFormElement>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const bodyId = useId();
	const pendingKey = pendingIds.join("\u0000");

	useEffect(() => {
		if (state.approved == null && state.error == null) return;
		setSelected(new Set());
		dialogRef.current?.close();
	}, [state]);

	useEffect(() => {
		const allowed = new Set(pendingKey ? pendingKey.split("\u0000") : []);
		setSelected((current) => {
			const next = new Set([...current].filter((id) => allowed.has(id)));
			return next.size === current.size ? current : next;
		});
	}, [pendingKey]);

	function toggle(id: string) {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function toggleAll() {
		setSelected((current) => {
			if (current.size === pendingIds.length) return new Set();
			return new Set(pendingIds);
		});
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (selected.size > 0) dialogRef.current?.showModal();
	}

	function confirmApprove() {
		const form = formRef.current;
		dialogRef.current?.close();
		if (form) formAction(new FormData(form));
	}

	const errorText =
		state.error === "forbidden"
			? t("bulkForbidden")
			: state.error === "invalid"
				? t("bulkInvalid")
				: state.error === "too_many"
					? t("bulkTooMany", { max: BULK_APPROVE_MAX })
					: state.error === "none"
						? t("bulkNone", { skipped: state.skipped ?? 0 })
						: state.error === "failed"
							? t("bulkFailed", { skipped: state.skipped ?? 0 })
							: null;
	const resultText =
		state.approved != null && state.approved > 0
			? state.skipped
				? t("bulkApprovedPartial", { approved: state.approved, skipped: state.skipped })
				: t("bulkApproved", { approved: state.approved })
			: null;
	const partial = !errorText && Boolean(state.skipped);
	const warning = state.error === "none";
	const alert = Boolean(errorText) && !warning;

	return (
		<BulkSelectionContext.Provider value={{ pendingIds, selected, toggle, toggleAll }}>
			<form ref={formRef} onSubmit={handleSubmit}>
				<input type="hidden" name="locale" value={locale} />

				{errorText || resultText ? (
					<div className="mb-4 flex flex-col gap-2">
						<p
							role={alert ? "alert" : "status"}
							className={cn(
								"rounded-panel border px-3 py-2 text-meta",
								alert
									? "border-alarm-400/30 bg-alarm-400/10 text-alarm-300"
									: partial || warning
										? "border-caution-400/30 bg-caution-400/10 text-caution-300"
										: "border-clear-400/30 bg-clear-400/10 text-clear-300",
							)}
						>
							{errorText ?? resultText}
						</p>
					</div>
				) : null}

				{pendingIds.length > 0 ? (
					<div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-panel border border-ink-700 bg-ink-900/40 px-3 py-2">
						<div className="flex flex-wrap items-center gap-3 text-meta text-fog-500">
							<span aria-live="polite">{t("selectedCount", { count: selected.size })}</span>
							{selected.size > 0 ? (
								<button
									type="button"
									onClick={() => setSelected(new Set())}
									className="text-fog-400 underline-offset-2 hover:text-signal-300 hover:underline"
								>
									{t("clearSelection")}
								</button>
							) : null}
						</div>
						<Button
							type="submit"
							size="sm"
							variant="secondary"
							disabled={selected.size === 0 || pending}
						>
							{pending ? t("approving") : t("approveSelected")}
						</Button>
					</div>
				) : null}
				{children}
			</form>

			<dialog
				ref={dialogRef}
				aria-labelledby={titleId}
				aria-describedby={bodyId}
				className="w-[min(28rem,calc(100vw-2rem))] rounded-overlay border border-ink-600 bg-ink-900 p-0 text-fog-100 backdrop:bg-ink-950/80"
			>
				<div className="flex flex-col gap-4 p-5">
					<h2 id={titleId} className="font-display text-emphasis font-semibold text-fog-50">
						{t("bulkConfirmTitle")}
					</h2>
					<p id={bodyId} className="text-meta leading-relaxed text-fog-400">
						{t("bulkConfirmBody", { count: selected.size })}
					</p>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => dialogRef.current?.close()}
						>
							{tCommon("cancel")}
						</Button>
						<Button type="button" size="sm" onClick={confirmApprove}>
							{t("approve")}
						</Button>
					</div>
				</div>
			</dialog>
		</BulkSelectionContext.Provider>
	);
}

export function BulkSelectAll() {
	const context = useContext(BulkSelectionContext);
	const t = useTranslations("devices");
	const ref = useRef<HTMLInputElement>(null);
	const pendingIds = context?.pendingIds ?? [];
	const allSelected = pendingIds.length > 0 && pendingIds.every((id) => context?.selected.has(id));
	const someSelected = pendingIds.some((id) => context?.selected.has(id));

	useEffect(() => {
		if (ref.current) ref.current.indeterminate = someSelected && !allSelected;
	}, [allSelected, someSelected]);

	if (!context || pendingIds.length === 0) return null;

	return (
		<input
			ref={ref}
			type="checkbox"
			checked={allSelected}
			onChange={context.toggleAll}
			aria-label={t("selectAllPending")}
			className={checkboxClass}
		/>
	);
}

export function BulkRowCheckbox({ deviceId, label }: { deviceId: string; label: string }) {
	const context = useContext(BulkSelectionContext);
	const t = useTranslations("devices");

	if (!context) return null;

	return (
		<input
			type="checkbox"
			name="deviceIds"
			value={deviceId}
			checked={context.selected.has(deviceId)}
			onChange={() => context.toggle(deviceId)}
			aria-label={t("selectTracker", { label })}
			className={checkboxClass}
		/>
	);
}
