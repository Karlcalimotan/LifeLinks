/*
  Pure WiFi provisioning logic for the LifeLink tracker.

  Arduino-free, so the host-native Unity tests compile this header directly.
  It owns the rules that are easy to get wrong and expensive to discover on the
  bench: the setup AP name, the form limits, the stored-value checks and the
  boot reset hold sequence.

  Security rules encoded here:
  - an SSID is 1-32 bytes, a password is empty (open network) or 8-63 bytes,
	and a device token is 8-128 bytes;
  - provisioning is complete only when NVS holds the marker plus a usable
	network and identity;
  - the AP name is derived from the eFuse MAC, never from user input.
*/
#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace fw {

// "LifeLink-XXXX" plus the terminating NUL.
static const size_t kProvisioningApNameMax = 14;
static const size_t kSsidMaxLength = 32;
static const size_t kPasswordMinLength = 8;
static const size_t kPasswordMaxLength = 63;
static const size_t kDeviceIdMaxLength = 64;
static const size_t kTokenMinLength = 8;
static const size_t kTokenMaxLength = 128;

// Boot reset gesture on the existing cancel button (GPIO 33).
static const uint32_t kResetDebounceMs = 50;
static const uint32_t kResetStartupGraceMs = 5000;
static const uint32_t kWifiResetHoldMs = 5000;
static const uint32_t kFactoryResetHoldMs = 10000;
// The listener only accepts a new hold inside this window after boot. Once the
// tracker is monitoring, a long press of the cancel button must never reboot it.
static const uint32_t kBootResetWindowMs = 60000;

// Commissioning portal.
static const uint32_t kPortalMaxLifetimeMs = 10UL * 60UL * 1000UL;
static const uint32_t kJoinTimeoutMs = 20000;
static const uint32_t kJoinQuickFailMs = 6000;
static const uint8_t kMaxJoinFailures = 3;

enum class ProvisioningField : uint8_t {
	None = 0,
	Ssid,
	Password,
	DeviceId,
	Token,
};

enum class BootResetAction : uint8_t {
	None = 0,
	ClearWifi,
	ClearAll,
};

inline bool isHexDigit(char c) {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

inline char upperHexDigit(char c) {
	if (c >= 'a' && c <= 'f') return static_cast<char>(c - 'a' + 'A');
	return c;
}

/**
 * Build "LifeLink-XXXX" from the last four hex digits of a MAC string.
 * Separators and any other non-hex characters are ignored; the hex digits are
 * uppercased and left-padded with '0' when fewer than four remain. This matches
 * the identity printed at boot and used for registration, and never trusts a
 * form field.
 */
inline bool provisioningApName(const char* mac, char* out, size_t outSize) {
	if (out == nullptr || outSize < kProvisioningApNameMax) return false;

	char hex[13] = {0};
	size_t hexLength = 0;
	if (mac != nullptr) {
		for (const char* cursor = mac; *cursor != '\0' && hexLength < sizeof(hex) - 1; ++cursor) {
			if (isHexDigit(*cursor)) hex[hexLength++] = upperHexDigit(*cursor);
		}
	}

	char tail[4] = {'0', '0', '0', '0'};
	const size_t start = hexLength > 4 ? hexLength - 4 : 0;
	for (size_t index = start; index < hexLength; index += 1) {
		tail[4 - (hexLength - index)] = hex[index];
	}

	static const char kPrefix[] = "LifeLink-";
	size_t position = 0;
	for (size_t index = 0; kPrefix[index] != '\0'; index += 1) {
		out[position++] = kPrefix[index];
	}
	for (size_t index = 0; index < 4; index += 1) out[position++] = tail[index];
	out[position] = '\0';
	return true;
}

inline size_t boundedLength(const char* value) { return value == nullptr ? 0 : strlen(value); }

inline bool isValidStoredSsid(const char* value) {
	const size_t length = boundedLength(value);
	return length >= 1 && length <= kSsidMaxLength;
}

inline bool isValidStoredPassword(const char* value) {
	if (value == nullptr) return false;
	const size_t length = strlen(value);
	return length == 0 || (length >= kPasswordMinLength && length <= kPasswordMaxLength);
}

inline bool isValidStoredDeviceId(const char* value) {
	const size_t length = boundedLength(value);
	return length >= 1 && length <= kDeviceIdMaxLength;
}

inline bool isValidStoredToken(const char* value) {
	const size_t length = boundedLength(value);
	return length >= kTokenMinLength && length <= kTokenMaxLength;
}

/**
 * True only when the unit has been through a verified save and every stored
 * value is still usable. A missing marker, SSID, identity or a stale WPA
 * password length reopens the setup portal instead of pretending the unit is
 * ready.
 */
inline bool isProvisioningComplete(bool provisioned, const char* ssid, const char* password,
								   const char* deviceId, const char* token) {
	return provisioned && isValidStoredSsid(ssid) && isValidStoredPassword(password) &&
		   isValidStoredDeviceId(deviceId) && isValidStoredToken(token);
}

/**
 * Validate a setup form submission. The caller resolves a blank Device Token
 * to the already-stored token before calling this, so an existing identity can
 * be kept without the page ever rendering it back.
 */
inline ProvisioningField validateProvisioningForm(const char* ssid, const char* password,
												  const char* deviceId, const char* token) {
	if (!isValidStoredSsid(ssid)) return ProvisioningField::Ssid;
	if (!isValidStoredPassword(password)) return ProvisioningField::Password;
	if (!isValidStoredDeviceId(deviceId)) return ProvisioningField::DeviceId;
	if (!isValidStoredToken(token)) return ProvisioningField::Token;
	return ProvisioningField::None;
}

inline const char* provisioningFieldMessage(ProvisioningField field) {
	switch (field) {
		case ProvisioningField::Ssid:
			return "Wi-Fi name must be 1-32 characters.";
		case ProvisioningField::Password:
			return "Password must be empty (open network) or 8-63 characters.";
		case ProvisioningField::DeviceId:
			return "Device ID must be 1-64 characters.";
		case ProvisioningField::Token:
			return "Device Token must be 8-128 characters.";
		default:
			return "";
	}
}

/**
 * Boot-only reset gesture on the cancel button.
 *
 * The listener arms only after the startup grace AND after a clean release.
 * A button that is stuck low from power-on therefore never arms. It accepts a
 * new hold only inside the boot window; a long press while the tracker is
 * monitoring cannot reset it.
 *
 * update() returns ClearWifi at 5 s of a debounced hold and ClearAll at 10 s.
 * A WiFi-only clear restarts when the button is released, so continuing to
 * 10 s still reaches the factory clear instead of rebooting at 5 s.
 */
class BootResetSequence {
  public:
	void begin(uint32_t bootMs) {
		bootMs_ = bootMs;
		lastRawChangeMs_ = bootMs;
		pressStartMs_ = 0;
		rawPressed_ = false;
		armed_ = false;
		wifiCleared_ = false;
		allCleared_ = false;
		restartPending_ = false;
		finished_ = false;
	}

	BootResetAction update(uint32_t nowMs, bool pressed) {
		if (finished_ || restartPending_) return BootResetAction::None;

		if (pressed != rawPressed_) {
			rawPressed_ = pressed;
			lastRawChangeMs_ = nowMs;
			return BootResetAction::None;
		}
		if ((nowMs - lastRawChangeMs_) < kResetDebounceMs) return BootResetAction::None;

		if (!armed_) {
			if ((nowMs - bootMs_) >= kBootResetWindowMs) {
				finished_ = true;
				return BootResetAction::None;
			}
			if (pressed) return BootResetAction::None;
			if ((nowMs - bootMs_) < kResetStartupGraceMs) return BootResetAction::None;
			armed_ = true;
			return BootResetAction::None;
		}

		if (!pressed) {
			if (pressStartMs_ == 0) {
				if ((nowMs - bootMs_) >= kBootResetWindowMs) finished_ = true;
				return BootResetAction::None;
			}
			const uint32_t heldMs = nowMs - pressStartMs_;
			pressStartMs_ = 0;
			const BootResetAction action = actionForHold(heldMs);
			// A WiFi-only clear must not reboot at 5 s, otherwise the 10 s
			// factory gesture could never be reached. Leave on release.
			if (wifiCleared_) restartPending_ = true;
			if ((nowMs - bootMs_) >= kBootResetWindowMs) finished_ = true;
			return action;
		}

		if (pressStartMs_ == 0) {
			// Accept a hold whose debounced edge began inside the boot window.
			// A press that starts after the window must never reboot a unit that
			// is already monitoring.
			if ((lastRawChangeMs_ - bootMs_) >= kBootResetWindowMs) {
				finished_ = true;
				return BootResetAction::None;
			}
			pressStartMs_ = lastRawChangeMs_;
		}
		return actionForHold(nowMs - pressStartMs_);
	}

	void disable() { finished_ = true; }

	// Drop a pending restart and disarm for the rest of the boot. Used when the
	// alert state machine leaves Idle: the alert owns the device, even if the
	// operator had already completed the hold.
	void abort() {
		finished_ = true;
		restartPending_ = false;
		pressStartMs_ = 0;
	}

	bool active() const { return !finished_ && !restartPending_; }
	bool armed() const { return armed_; }
	bool restartPending() const { return restartPending_; }

	uint32_t holdMs(uint32_t nowMs) const {
		if (pressStartMs_ == 0) return 0;
		return nowMs - pressStartMs_;
	}

  private:
	BootResetAction actionForHold(uint32_t heldMs) {
		if (heldMs >= kFactoryResetHoldMs && !allCleared_) {
			allCleared_ = true;
			wifiCleared_ = true;
			restartPending_ = true;
			return BootResetAction::ClearAll;
		}
		if (heldMs >= kWifiResetHoldMs && !wifiCleared_) {
			wifiCleared_ = true;
			return BootResetAction::ClearWifi;
		}
		return BootResetAction::None;
	}

	uint32_t bootMs_ = 0;
	uint32_t lastRawChangeMs_ = 0;
	uint32_t pressStartMs_ = 0;
	bool rawPressed_ = false;
	bool armed_ = false;
	bool wifiCleared_ = false;
	bool allCleared_ = false;
	bool restartPending_ = false;
	bool finished_ = false;
};

}  // namespace fw
