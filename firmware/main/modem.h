#pragma once

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "gps.h"

namespace fw {

static const size_t kSmsMaxBytes = 320;

/**
 * The SMS is the last channel that still works when the backend is unreachable.
 * Keep it short, include the age of the fix, and make the callback explicit.
 * The body is deliberately ASCII so a basic GSM handset renders it correctly.
 */
inline size_t buildSosSms(
	char* out,
	size_t size,
	const char* plateNo,
	const GpsFix& fix,
	float speedKph,
	const char* callbackNumber
) {
	if (out == nullptr || size == 0) return 0;

	char location[48];
	if (isValidCoordinate(fix.lat, fix.lng)) {
		snprintf(location, sizeof(location), "%.5f,%.5f", fix.lat, fix.lng);
	} else {
		snprintf(location, sizeof(location), "no-fix");
	}

	const unsigned long ageSeconds = static_cast<unsigned long>(fix.ageMs / 1000UL);
	const int written = snprintf(
		out,
		size,
		"LIFELINK SOS %s %s fix %lus %ukph%s%s",
		(plateNo != nullptr && plateNo[0] != '\0') ? plateNo : "vehicle",
		location,
		ageSeconds,
		static_cast<unsigned>(speedKph),
		(callbackNumber != nullptr && callbackNumber[0] != '\0') ? " call " : "",
		(callbackNumber != nullptr && callbackNumber[0] != '\0') ? callbackNumber : ""
	);
	if (written < 0) {
		out[0] = '\0';
		return 0;
	}
	const size_t length = static_cast<size_t>(written);
	if (length >= size) {
		out[size - 1] = '\0';
		return size - 1;
	}
	return length;
}

inline bool smsFits(const char* body) {
	return body != nullptr && strlen(body) <= kSmsMaxBytes;
}

}  // namespace fw
