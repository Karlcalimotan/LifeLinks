/*
  Pure display policy and text layout for the optional SSD1306 status display.

  Arduino-free, so the host-native Unity tests compile this header directly.
  It owns everything that is easy to get wrong on a 128x64 panel: the 21-column
  grid, ASCII sanitising, the setup AP name, the IPv4 text, the state labels and
  the refresh gate. The driver (display.h) only moves these lines to the panel.

  Security rule encoded here: the device token is deliberately absent from this
  API. No screen builder accepts or formats a token, so a screen can never
  render one. The home screen carries the device id and, only when it already
  exists, a UUID.
*/
#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "provisioning.h"

namespace fw {

// 128x64 panel with the built-in 5x7 font and a 1 px cell gap: 21 columns and
// 8 rows. The driver draws row N at y = N * 8.
static const size_t kDisplayColumns = 21;
static const size_t kDisplayRows = 8;
static const size_t kIpv4TextMax = 16;	// "255.255.255.255" plus the NUL
static const uint32_t kDisplayWifiOkHoldMs = 3000;
static const uint32_t kDisplayProgressStepMs = 500;
static const size_t kDisplayProgressDots = 4;
static const uint32_t kDisplayMinDrawGapMs = 250;

enum class DisplayWifiState : uint8_t {
	Setup = 0,
	Joining,
	Joined,
};

struct DisplayScreen {
	char lines[kDisplayRows][kDisplayColumns + 1];
	uint8_t lineCount;
};

/**
 * The refresh rule: a changed screen is drawn immediately the first time, then
 * no more often than kDisplayMinDrawGapMs. Unchanged content is never redrawn.
 * Pure, so the rule is testable without a panel or an Arduino clock.
 */
class DrawGate {
  public:
	bool shouldDraw(uint32_t nowMs, bool changed) const {
		if (!changed) return false;
		if (!hasDrawn_) return true;
		return (nowMs - lastDrawMs_) >= kDisplayMinDrawGapMs;
	}

	void markDrawn(uint32_t nowMs) {
		lastDrawMs_ = nowMs;
		hasDrawn_ = true;
	}

	bool hasDrawn() const { return hasDrawn_; }

  private:
	uint32_t lastDrawMs_ = 0;
	bool hasDrawn_ = false;
};

/**
 * Copy printable ASCII into a fixed line buffer. Control bytes and anything
 * above 0x7E become '?' so a UTF-8 SSID cannot produce a broken glyph or split
 * a multi-byte sequence. The result is always NUL-terminated and never longer
 * than maxChars (or outSize - 1, whichever is smaller).
 */
inline size_t copyDisplayText(const char* source, char* out, size_t outSize,
							  size_t maxChars = kDisplayColumns) {
	if (out == nullptr || outSize == 0) return 0;
	const size_t limit = maxChars < (outSize - 1) ? maxChars : (outSize - 1);
	size_t written = 0;
	if (source != nullptr) {
		for (const char* cursor = source; *cursor != '\0' && written < limit; ++cursor) {
			const unsigned char value = static_cast<unsigned char>(*cursor);
			out[written++] = (value >= 0x20 && value <= 0x7E) ? static_cast<char>(value) : '?';
		}
	}
	out[written] = '\0';
	return written;
}

inline void setScreenLine(DisplayScreen& screen, const char* text) {
	if (screen.lineCount >= kDisplayRows) return;
	copyDisplayText(text, screen.lines[screen.lineCount], kDisplayColumns + 1);
	screen.lineCount += 1;
}

/**
 * "WiFi: joined" means joined to a WiFi network, never "online": the tracker's
 * telemetry, commands and SOS stay on the A7670E modem. The labels deliberately
 * avoid an online/offline claim.
 */
inline const char* wifiStateLabel(DisplayWifiState state) {
	switch (state) {
		case DisplayWifiState::Joining:
			return "WiFi: joining";
		case DisplayWifiState::Joined:
			return "WiFi: joined";
		default:
			return "WiFi: setup";
	}
}

inline bool formatIpv4(uint8_t a, uint8_t b, uint8_t c, uint8_t d, char* out, size_t outSize) {
	if (out == nullptr || outSize == 0) return false;
	const int written =
		snprintf(out, outSize, "%u.%u.%u.%u", static_cast<unsigned>(a), static_cast<unsigned>(b),
				 static_cast<unsigned>(c), static_cast<unsigned>(d));
	if (written < 0 || static_cast<size_t>(written) >= outSize) {
		out[0] = '\0';
		return false;
	}
	return true;
}

inline size_t progressDots(uint32_t tick) {
	return static_cast<size_t>(tick % kDisplayProgressDots);
}

inline DisplayScreen provisioningScreen(const char* apName) {
	DisplayScreen screen{};
	setScreenLine(screen, "WiFi setup");
	setScreenLine(screen, "Join network:");
	setScreenLine(screen, (apName != nullptr && apName[0] != '\0') ? apName : "LifeLink-0000");
	setScreenLine(screen, "Open 192.168.4.1");
	return screen;
}

// Convenience for the firmware and the tests: the AP name always comes from the
// same MAC-derived rule the setup portal uses, never from user input.
inline DisplayScreen provisioningScreenForMac(const char* mac) {
	char name[kProvisioningApNameMax];
	if (!provisioningApName(mac, name, sizeof(name))) {
		copyDisplayText("LifeLink-0000", name, sizeof(name));
	}
	return provisioningScreen(name);
}

inline DisplayScreen joiningScreen(const char* ssid, uint32_t progressTick, uint8_t attempt,
								   uint8_t maxAttempts) {
	DisplayScreen screen{};
	setScreenLine(screen, "Joining WiFi");
	setScreenLine(screen, (ssid != nullptr && ssid[0] != '\0') ? ssid : "(no network)");

	char progress[16] = "Working";
	size_t length = strlen(progress);
	const size_t dots = progressDots(progressTick);
	for (size_t index = 0; index < dots && (length + 1) < sizeof(progress); index += 1) {
		progress[length++] = '.';
	}
	progress[length] = '\0';
	setScreenLine(screen, progress);

	if (attempt > 0 && maxAttempts > 0) {
		char attemptLine[16];
		snprintf(attemptLine, sizeof(attemptLine), "Try %u of %u", static_cast<unsigned>(attempt),
				 static_cast<unsigned>(maxAttempts));
		setScreenLine(screen, attemptLine);
	}
	return screen;
}

inline DisplayScreen wifiOkScreen(const char* ssid, const char* ip) {
	DisplayScreen screen{};
	setScreenLine(screen, "WiFi OK - saved");
	setScreenLine(screen, (ssid != nullptr && ssid[0] != '\0') ? ssid : "(saved)");
	char line[32];
	snprintf(line, sizeof(line), "IP %s", (ip != nullptr && ip[0] != '\0') ? ip : "-");
	setScreenLine(screen, line);
	setScreenLine(screen, "Uplink: 4G modem");
	return screen;
}

inline DisplayScreen homeScreen(DisplayWifiState state, const char* deviceId, const char* uuid) {
	DisplayScreen screen{};
	setScreenLine(screen, "LifeLink tracker");
	setScreenLine(screen, wifiStateLabel(state));
	setScreenLine(screen, "Uplink: 4G modem");
	setScreenLine(screen, "Device ID");
	setScreenLine(screen, (deviceId != nullptr && deviceId[0] != '\0') ? deviceId : "(unknown)");
	// A UUID is shown only when one already exists. Nothing invents one here.
	if (uuid != nullptr && uuid[0] != '\0') {
		setScreenLine(screen, "UUID");
		setScreenLine(screen, uuid);
	}
	return screen;
}

}  // namespace fw
