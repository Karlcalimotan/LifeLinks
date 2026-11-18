/*
  Pure impact/tilt/vibration filtering. No Arduino dependency: the host-native
  Unity tests compile this header directly.

  The filter deliberately distinguishes a crash from the three false positives
  that matter on a vehicle:

  - a pothole: one short spike, no vibration, no real speed drop
  - a door slam: impact while parked, no vibration, no tilt
  - harsh braking: sustained moderate acceleration, no vibration

  A rollover is confirmed by tilt alone after one second.
*/
#pragma once

#include <math.h>
#include <stdint.h>

#include "config.h"

namespace fw {

struct ImuSample {
	float accelG;
	float tiltDeg;
	bool vibration;
	float speedKph;
	bool ignition;
	uint32_t timestampMs;
};

enum class ImpactDecision {
	None,
	Candidate,
	Confirm,
	Reject,
};

class ImpactFilter {
  public:
	explicit ImpactFilter(const DeviceConfig& config = defaultConfig()) {
		setConfig(config);
		reset();
	}

	void setConfig(const DeviceConfig& config) { config_ = config; }

	void reset() {
		candidate_ = false;
		candidateStartMs_ = 0;
		peakAccelG_ = 0.0f;
		peakTiltDeg_ = 0.0f;
		vibrationCount_ = 0;
		speedAtStartKph_ = 0.0f;
		tiltActive_ = false;
		tiltStartMs_ = 0;
	}

	ImpactDecision update(const ImuSample& sample) {
		// Rollover: sustained tilt beyond the threshold. A momentary lean on a
		// curve must not confirm.
		if (sample.tiltDeg >= config_.tiltThresholdDeg) {
			if (!tiltActive_) {
				tiltActive_ = true;
				tiltStartMs_ = sample.timestampMs;
			} else if (sample.timestampMs - tiltStartMs_ >= 1000) {
				lastPeakAccelG_ = sample.accelG;
				lastPeakTiltDeg_ = sample.tiltDeg;
				lastVibrationCount_ = sample.vibration ? 1 : 0;
				reset();
				return ImpactDecision::Confirm;
			}
		} else {
			tiltActive_ = false;
		}

		const bool impact = sample.accelG >= config_.impactThresholdG;
		if (!candidate_) {
			if (!impact) return ImpactDecision::None;

			candidate_ = true;
			candidateStartMs_ = sample.timestampMs;
			peakAccelG_ = sample.accelG;
			peakTiltDeg_ = sample.tiltDeg;
			vibrationCount_ = sample.vibration ? 1 : 0;
			speedAtStartKph_ = sample.speedKph;
			return ImpactDecision::Candidate;
		}

		peakAccelG_ = fmaxf(peakAccelG_, sample.accelG);
		peakTiltDeg_ = fmaxf(peakTiltDeg_, sample.tiltDeg);
		if (sample.vibration) vibrationCount_ += 1;

		const uint32_t elapsed = sample.timestampMs - candidateStartMs_;
		if (elapsed <= static_cast<uint32_t>(config_.confirmWindowMs)) {
			return ImpactDecision::Candidate;
		}

		const bool speedDrop = (speedAtStartKph_ - sample.speedKph) >= 15.0f;
		const bool tilted = peakTiltDeg_ >= config_.tiltThresholdDeg;
		const bool vibration = vibrationCount_ > 0;
		const bool confirmed = vibration && (tilted || speedDrop);

		lastPeakAccelG_ = peakAccelG_;
		lastPeakTiltDeg_ = peakTiltDeg_;
		lastVibrationCount_ = vibrationCount_;
		reset();
		return confirmed ? ImpactDecision::Confirm : ImpactDecision::Reject;
	}

	float peakAccelG() const { return peakAccelG_; }
	float peakTiltDeg() const { return peakTiltDeg_; }
	int vibrationCount() const { return vibrationCount_; }

	float lastPeakAccelG() const { return lastPeakAccelG_; }
	float lastPeakTiltDeg() const { return lastPeakTiltDeg_; }
	int lastVibrationCount() const { return lastVibrationCount_; }

  private:
	DeviceConfig config_{};
	bool candidate_ = false;
	uint32_t candidateStartMs_ = 0;
	float peakAccelG_ = 0.0f;
	float peakTiltDeg_ = 0.0f;
	int vibrationCount_ = 0;
	float speedAtStartKph_ = 0.0f;
	bool tiltActive_ = false;
	uint32_t tiltStartMs_ = 0;
	float lastPeakAccelG_ = 0.0f;
	float lastPeakTiltDeg_ = 0.0f;
	int lastVibrationCount_ = 0;
};

/**
 * Debounce a button or a digital line. Returns true exactly once when the
 * stable state changes.
 */
class Debouncer {
  public:
	explicit Debouncer(uint32_t debounceMs = 50, bool initial = false)
		: debounceMs_(debounceMs), stable_(initial), lastRaw_(initial) {}

	bool update(bool raw, uint32_t nowMs) {
		if (raw != lastRaw_) {
			lastRaw_ = raw;
			lastChangeMs_ = nowMs;
		}
		if ((nowMs - lastChangeMs_) >= debounceMs_ && stable_ != lastRaw_) {
			stable_ = lastRaw_;
			return true;
		}
		return false;
	}

	bool state() const { return stable_; }

  private:
	uint32_t debounceMs_;
	bool stable_;
	bool lastRaw_;
	uint32_t lastChangeMs_ = 0;
};

}  // namespace fw
