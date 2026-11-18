"use client";

import { Button } from "@/components/ui/button";
import { type DeviceTokenState, rotateDeviceTokenAction } from "@/lib/actions/devices";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useActionState, useState } from "react";

const initial: DeviceTokenState = { ok: false };

export function RotateTokenButton({
	deviceId,
	locale,
}: {
	deviceId: string;
	locale: string;
}) {
	const [state, formAction, pending] = useActionState(rotateDeviceTokenAction, initial);
	const [copied, setCopied] = useState(false);

	async function copyToken() {
		if (!state.token) return;
		await navigator.clipboard.writeText(state.token);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className="flex flex-col gap-3">
			<form action={formAction}>
				<input type="hidden" name="locale" value={locale} />
				<input type="hidden" name="deviceId" value={deviceId} />
				<Button type="submit" size="sm" variant="outline" disabled={pending}>
					<RefreshCw className="size-3.5" />
					{pending ? "Rotating…" : "Rotate token"}
				</Button>
			</form>

			{state.error ? (
				<p className="rounded border border-alarm-500/30 bg-alarm-500/10 px-3 py-2 text-xs text-alarm-300">
					{state.error}
				</p>
			) : null}

			{state.ok && state.token ? (
				<div className="rounded border border-caution-500/30 bg-caution-500/10 p-4">
					<p className="text-xs font-semibold text-caution-200">
						New token. Copy it now — the old token stopped working.
					</p>
					<div className="mt-2 flex items-center gap-2">
						<code className="min-w-0 flex-1 overflow-x-auto rounded border border-caution-500/20 bg-ink-950/60 px-3 py-2 text-xs text-caution-200">
							{state.token}
						</code>
						<Button type="button" size="sm" variant="outline" onClick={copyToken}>
							{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
							{copied ? "Copied" : "Copy"}
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
