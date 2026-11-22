#pragma once

#include <stdint.h>

namespace fw {

struct GpsFix {
	bool valid;
	double lat;
	double lng;
	uint32_t ageMs;
	uint8_t satellites;
	float hdop;
};

inline bool isValidCoordinate(double lat, double lng) {
	if (lat < -90.0 || lat > 90.0) return false;
	if (lng < -180.0 || lng > 180.0) return false;
	return !(lat == 0.0 && lng == 0.0);
}

/**
 * A usable fix needs four satellites, a reasonable HDOP and a recent age. A
 * stale fix is still sent with its age: the dashboard must never hide an SOS
 * because the sky view is poor.
 */
inline bool hasUsableFix(const GpsFix& fix, uint32_t maxAgeMs = 120000) {
	return fix.valid && fix.satellites >= 4 && fix.hdop > 0.0f && fix.hdop <= 5.0f &&
		   fix.ageMs <= maxAgeMs && isValidCoordinate(fix.lat, fix.lng);
}

}  // namespace fw
