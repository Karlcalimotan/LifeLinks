/*
  LifeLink firmware configuration contract.

  Class A (envelope): the dashboard can never move a value outside the min/max
  window below. Class B (operational): the server sends these fields in the
  command poll. Class C (transport): pins, URLs, NVS keys and HTTP timeouts live
  in the sketch and are not configurable.

  The server's `apps/web/lib/firmware/config.ts` carries the same table.
  `apps/web/lib/firmware/config.test.ts` parses this header and fails when the
  two drift.
*/
#pragma once

#include <math.h>
#include <stddef.h>
#include <stdint.h>

namespace fw {

static const int kConfigContractVersion = 1;

#define FW_CONFIG_FIELDS(X)                                                   \
	X(impactThresholdG, "impact_threshold_g", 1.5f, 16.0f, false, 15.0f)      \
	X(tiltThresholdDeg, "tilt_threshold_deg", 30.0f, 90.0f, false, 60.0f)     \
	X(confirmWindowMs, "confirm_window_ms", 100.0f, 2000.0f, true, 200.0f)    \
	X(cancelWindowS, "cancel_window_s", 5.0f, 60.0f, true, 15.0f)             \
	X(heartbeatIntervalS, "heartbeat_interval_s", 10.0f, 300.0f, true, 30.0f) \
	X(sosRetryS, "sos_retry_s", 30.0f, 300.0f, true, 60.0f)

#define FW_DECLARE_FIELD(name, key, min, max, integer, def) float name;
struct DeviceConfig {
	FW_CONFIG_FIELDS(FW_DECLARE_FIELD)
};
#undef FW_DECLARE_FIELD

struct FieldSpec {
	const char* key;
	float minValue;
	float maxValue;
	bool integer;
	float defaultValue;
};

static const FieldSpec kSpecs[] = {
#define FW_SPEC(name, key, min, max, integer, def) {key, min, max, integer, def},
	FW_CONFIG_FIELDS(FW_SPEC)
#undef FW_SPEC
};

static const size_t kSpecCount = sizeof(kSpecs) / sizeof(kSpecs[0]);

inline DeviceConfig defaultConfig() {
	DeviceConfig config{};
#define FW_ASSIGN(name, key, min, max, integer, def) config.name = def;
	FW_CONFIG_FIELDS(FW_ASSIGN)
#undef FW_ASSIGN
	return config;
}

inline bool validateConfig(const DeviceConfig& config) {
#define FW_CHECK(name, key, min, max, integer, def)               \
	if (config.name < (min) || config.name > (max)) return false; \
	if ((integer) && floorf(config.name) != config.name) return false;
	FW_CONFIG_FIELDS(FW_CHECK)
#undef FW_CHECK
	return true;
}

inline bool nearlyEqual(float a, float b, float epsilon = 0.0001f) {
	return fabsf(a - b) <= epsilon;
}

inline bool contractVersionSupported(int version) { return version == kConfigContractVersion; }

}  // namespace fw
