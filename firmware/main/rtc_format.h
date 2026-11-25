/*
  Pure clock helpers for the DS3231 impact timestamp.

  Arduino-free, so the host-native Unity tests compile this header directly.
  The DS3231 counts 2000-2099; the firmware only trusts a clock inside the
  window where an incident timestamp is meaningful. Anything outside it (an
  unset module reports 2000-01-01, a dead bus reads 0) is treated as unknown,
  never as 1970-01-01.
*/
#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

namespace fw {

// 2024-01-01T00:00:00Z up to, but not including, 2100-01-01T00:00:00Z. The
// lower bound matches the GPS epoch check in main.ino: a date before the
// tracker existed cannot be a real impact time.
static const uint32_t kMinPlausibleEpoch = 1704067200UL;
static const uint32_t kMaxPlausibleEpochExclusive = 4102444800UL;
static const size_t kClockHmsTextMax = 9;  // "HH:MM:SS" plus the NUL

inline bool isPlausibleEpoch(uint32_t epoch) {
	return epoch >= kMinPlausibleEpoch && epoch < kMaxPlausibleEpochExclusive;
}

/**
 * Format seconds since the Unix epoch as UTC "HH:MM:SS". Returns false and
 * leaves an empty string for an implausible epoch, a null buffer or a buffer
 * smaller than kClockHmsTextMax. The caller decides how to render an unknown
 * clock; this helper never invents one.
 */
inline bool formatClockHms(uint32_t epoch, char* out, size_t outSize) {
	if (out == nullptr || outSize == 0) return false;
	out[0] = '\0';
	if (outSize < kClockHmsTextMax || !isPlausibleEpoch(epoch)) return false;

	const uint32_t secondsOfDay = epoch % 86400UL;
	const unsigned hour = static_cast<unsigned>(secondsOfDay / 3600UL);
	const unsigned minute = static_cast<unsigned>((secondsOfDay % 3600UL) / 60UL);
	const unsigned second = static_cast<unsigned>(secondsOfDay % 60UL);

	const int written = snprintf(out, outSize, "%02u:%02u:%02u", hour, minute, second);
	if (written != 8) {
		out[0] = '\0';
		return false;
	}
	return true;
}

}  // namespace fw
