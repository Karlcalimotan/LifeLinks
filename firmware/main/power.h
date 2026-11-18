#pragma once

#include <stdint.h>

namespace fw {

enum class PowerState {
	Main,
	Backup,
	Critical,
};

inline float adcToVoltage(uint16_t raw, float dividerRatio, float vref = 3.3f, uint16_t maxAdc = 4095) {
	if (maxAdc == 0) return 0.0f;
	return (static_cast<float>(raw) / static_cast<float>(maxAdc)) * vref * dividerRatio;
}

/**
 * `ignition` is the vehicle's switched 12 V sense. When it is off, the tracker
 * is on the 18650 backup even if the battery still reads healthy.
 */
inline PowerState classifyPower(bool ignition, float batteryV) {
	if (batteryV < 11.0f) return PowerState::Critical;
	if (!ignition || batteryV < 11.8f) return PowerState::Backup;
	return PowerState::Main;
}

inline bool shouldSendPowerLost(PowerState previous, PowerState current) {
	return previous == PowerState::Main && current != PowerState::Main;
}

}  // namespace fw
