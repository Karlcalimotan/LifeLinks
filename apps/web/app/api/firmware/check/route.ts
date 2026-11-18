import { ok } from "@/lib/api/envelope";
import { badRequest, forbidden } from "@/lib/api/errors";
import { withApi } from "@/lib/api/instrumentation";
import { isDeviceApproved, requireDevice } from "@/lib/device/auth";

export const dynamic = "force-dynamic";

interface ReleaseManifest {
	version: string;
	url: string;
	sha256: string;
	signature: string;
	notes?: string;
}

function configuredRelease(): ReleaseManifest | null {
	const version = process.env.LIFELINK_FIRMWARE_VERSION?.trim();
	const url = process.env.LIFELINK_FIRMWARE_URL?.trim();
	const sha256 = process.env.LIFELINK_FIRMWARE_SHA256?.trim();
	const signature = process.env.LIFELINK_FIRMWARE_SIGNATURE?.trim();
	if (!version || !url || !sha256 || !signature) return null;
	return { version, url, sha256, signature, notes: process.env.LIFELINK_FIRMWARE_NOTES };
}

/**
 * OTA check. There is no release baked into the binary and no unsigned update:
 * the endpoint returns `update_available: false` until an operator configures a
 * signed manifest. The device still verifies the signature before flashing.
 */
export const GET = withApi(
	async (request) => {
		const device = await requireDevice(request);
		if (!isDeviceApproved(device)) throw forbidden("Device is not approved.");

		const url = new URL(request.url);
		const requested = url.searchParams.get("device_id");
		if (!requested) throw badRequest("device_id is required.");
		if (requested !== device.mac && requested !== device.id) {
			throw forbidden("device_id does not match the authenticated token.");
		}

		const release = configuredRelease();
		if (!release) {
			return ok({
				update_available: false,
				reason: "no_release_configured",
				current_version: device.firmwareVersion ?? url.searchParams.get("version") ?? "unknown",
			});
		}

		const current = device.firmwareVersion ?? url.searchParams.get("version") ?? "0.0.0";
		const updateAvailable = current !== release.version;

		return ok({
			update_available: updateAvailable,
			current_version: current,
			version: release.version,
			url: release.url,
			sha256: release.sha256,
			signature: release.signature,
			notes: release.notes,
		});
	},
	{ route: "GET /api/firmware/check" },
);
