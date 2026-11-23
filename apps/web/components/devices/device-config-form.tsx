"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import { type DeviceConfigState, updateDeviceConfigAction } from "@/lib/actions/device-config";
import { CONFIG_FIELDS, type ConfigField, type FirmwareConfigValues } from "@/lib/firmware/config";
import {
	type DeviceConfigErrorCode,
	type DeviceConfigFieldErrors,
	type DeviceConfigOverrides,
	overrideInputName,
	validateDeviceConfigOverride,
} from "@/lib/firmware/device-config";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

const initial: DeviceConfigState = { ok: false };

type InheritedState = Record<keyof FirmwareConfigValues, boolean>;
type ValueState = Record<keyof FirmwareConfigValues, string>;

function initialInherited(overrides: DeviceConfigOverrides): InheritedState {
	return Object.fromEntries(
		CONFIG_FIELDS.map((field) => [field.key, overrides[field.key] == null]),
	) as InheritedState;
}

function initialValues(overrides: DeviceConfigOverrides): ValueState {
	return Object.fromEntries(
		CONFIG_FIELDS.map((field) => [
			field.key,
			overrides[field.key] == null ? "" : String(overrides[field.key]),
		]),
	) as ValueState;
}

function clearError(
	errors: DeviceConfigFieldErrors,
	key: keyof FirmwareConfigValues,
): DeviceConfigFieldErrors {
	if (!errors[key]) return errors;
	const next = { ...errors };
	delete next[key];
	return next;
}

export function DeviceConfigForm({
	deviceId,
	locale,
	orgValues,
	overrides,
}: {
	deviceId: string;
	locale: string;
	orgValues: FirmwareConfigValues;
	overrides: DeviceConfigOverrides;
}) {
	const t = useTranslations("devices.config");
	const [state, formAction, pending] = useActionState(updateDeviceConfigAction, initial);
	const [inherited, setInherited] = useState<InheritedState>(() => initialInherited(overrides));
	const [values, setValues] = useState<ValueState>(() => initialValues(overrides));
	const [clientErrors, setClientErrors] = useState<DeviceConfigFieldErrors>({});
	const errors: DeviceConfigFieldErrors = { ...state.fieldErrors, ...clientErrors };

	function errorText(code: DeviceConfigErrorCode, field: ConfigField): string {
		switch (code) {
			case "required":
				return t("errors.required");
			case "not_a_number":
				return t("errors.notANumber");
			case "fractional":
				return t("errors.fractional");
			case "below_min":
				return t("errors.belowMin", { min: field.min });
			case "above_max":
				return t("errors.aboveMax", { max: field.max });
		}
	}

	function toggleInherit(key: keyof FirmwareConfigValues, useDefault: boolean) {
		setInherited((current) => ({ ...current, [key]: useDefault }));
		if (!useDefault) {
			setValues((current) => ({
				...current,
				[key]: current[key] || String(overrides[key] ?? orgValues[key]),
			}));
		}
		setClientErrors((current) => clearError(current, key));
	}

	function changeValue(key: keyof FirmwareConfigValues, value: string) {
		setValues((current) => ({ ...current, [key]: value }));
		setClientErrors((current) => clearError(current, key));
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		const data = new FormData(event.currentTarget);
		const input: Record<string, unknown> = {};
		for (const field of CONFIG_FIELDS) {
			input[field.key] =
				data.get(overrideInputName(field.key)) === "on" ? null : data.get(field.key);
		}

		const result = validateDeviceConfigOverride(input);
		if (!result.ok) {
			event.preventDefault();
			setClientErrors(result.errors);
			return;
		}
		setClientErrors({});
	}

	return (
		<form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
			<input type="hidden" name="locale" value={locale} />
			<input type="hidden" name="deviceId" value={deviceId} />

			<p className="text-meta leading-relaxed text-fog-500">{t("intro")}</p>

			<div className="grid gap-3 sm:grid-cols-2">
				{CONFIG_FIELDS.map((field) => {
					const useDefault = inherited[field.key];
					const error = errors[field.key];
					const inputId = `device-config-${field.key}`;
					const hintId = `${inputId}-hint`;
					const errorId = `${inputId}-error`;
					const unit = t(`unit.${field.key}`);

					return (
						<div
							key={field.key}
							className="rounded-control border border-ink-700 bg-ink-950/40 p-3"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<Label htmlFor={inputId}>{t(`field.${field.key}`)}</Label>
								<label className="flex items-center gap-2 text-meta text-fog-500">
									<input
										type="checkbox"
										name={overrideInputName(field.key)}
										checked={useDefault}
										onChange={(event) => toggleInherit(field.key, event.target.checked)}
										className="size-4 rounded border-ink-600 bg-ink-950 accent-signal-500"
									/>
									{t("useDefault")}
								</label>
							</div>

							<div className="mt-2 flex items-center gap-2">
								<Input
									id={inputId}
									name={field.key}
									type="number"
									inputMode={field.integer ? "numeric" : "decimal"}
									min={field.min}
									max={field.max}
									step={field.integer ? 1 : "any"}
									value={values[field.key]}
									placeholder={String(orgValues[field.key])}
									disabled={useDefault}
									onChange={(event) => changeValue(field.key, event.target.value)}
									aria-invalid={error ? true : undefined}
									aria-describedby={error ? `${hintId} ${errorId}` : hintId}
								/>
								<span className="text-meta text-fog-500">{unit}</span>
							</div>

							<p id={hintId} className="mt-1 text-meta text-fog-500">
								{useDefault
									? t("orgDefault", { value: orgValues[field.key], unit })
									: t("envelope", { min: field.min, max: field.max, unit })}
							</p>

							{error ? (
								<p id={errorId} className="mt-1 text-meta text-alarm-300">
									{errorText(error.code, field)}
								</p>
							) : null}
						</div>
					);
				})}
			</div>

			<Field className="flex-row flex-wrap items-center gap-3">
				<Button type="submit" size="sm" disabled={pending}>
					{pending ? t("saving") : t("save")}
				</Button>
				{state.ok && state.changed ? (
					<output className="text-meta text-clear-300">
						{state.pushState === "confirmed" ? t("savedConfirmed") : t("savedPending")}
					</output>
				) : null}
				{state.ok && state.changed === false ? (
					<output className="text-meta text-fog-500">{t("unchanged")}</output>
				) : null}
				{state.error === "forbidden" ? (
					<span className="text-meta text-alarm-300">{t("errors.forbidden")}</span>
				) : null}
				{state.error === "notfound" ? (
					<span className="text-meta text-alarm-300">{t("errors.notFound")}</span>
				) : null}
			</Field>
		</form>
	);
}
