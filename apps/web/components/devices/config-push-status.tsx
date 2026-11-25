import type { ConfigPushState } from "@/lib/firmware/device-config";
import { CircleCheck, Clock3, SlidersHorizontal } from "lucide-react";
import { getTranslations } from "next-intl/server";

const tone = {
	confirmed: { icon: "text-clear-300", border: "border-clear-400/30" },
	pending: { icon: "text-caution-300", border: "border-caution-400/30" },
	none: { icon: "text-fog-500", border: "border-ink-700" },
} as const;

/**
 * A saved configuration is not an applied one. The banner stays on "pending"
 * until the device echoes the effective revision in a heartbeat or ingest.
 */
export async function ConfigPushStatus({
	locale,
	state,
	deviceRev,
	configRev,
}: {
	locale: string;
	state: ConfigPushState;
	deviceRev: number | null;
	configRev: number;
}) {
	const t = await getTranslations({ locale, namespace: "devices.config" });
	const Icon =
		state === "confirmed" ? CircleCheck : state === "pending" ? Clock3 : SlidersHorizontal;

	let body: string;
	if (state === "confirmed") {
		body = t("status.confirmed.body", { configRev });
	} else if (state === "pending") {
		body =
			deviceRev == null
				? t("status.pending.bodyNoRev", { configRev })
				: t("status.pending.body", { deviceRev, configRev });
	} else {
		body = t("status.none.body", { configRev });
	}

	return (
		<output className={`block rounded-control border bg-ink-950/40 p-3 ${tone[state].border}`}>
			<span className="flex items-center gap-2 text-body font-medium text-fog-100">
				<Icon className={`size-4 ${tone[state].icon}`} aria-hidden="true" />
				{t(`status.${state}.title`)}
			</span>
			<span className="mt-1 block text-meta leading-relaxed text-fog-500">{body}</span>
			<span className="mt-1 block font-mono text-meta text-fog-500">
				{t("revisions", { deviceRev: deviceRev ?? "-", configRev })}
			</span>
		</output>
	);
}
