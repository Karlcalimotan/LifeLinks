#pragma once

#include <stdint.h>

namespace fw {

enum class BuzzerPattern {
	Off,
	Countdown,
	Alerting,
	Cancelled,
	Fault,
};

struct PatternTiming {
	uint32_t onMs;
	uint32_t offMs;
};

inline PatternTiming timingFor(BuzzerPattern pattern) {
	switch (pattern) {
		case BuzzerPattern::Countdown:
			return {150, 850};
		case BuzzerPattern::Alerting:
			return {500, 500};
		case BuzzerPattern::Cancelled:
			return {80, 1920};
		case BuzzerPattern::Fault:
			return {100, 100};
		default:
			return {0, 0};
	}
}

class BuzzerController {
  public:
	void setPattern(BuzzerPattern pattern, uint32_t nowMs) {
		if (pattern == pattern_) return;
		pattern_ = pattern;
		startedMs_ = nowMs;
	}

	bool isOn(uint32_t nowMs) const {
		const PatternTiming timing = timingFor(pattern_);
		const uint32_t period = timing.onMs + timing.offMs;
		if (period == 0) return false;
		return ((nowMs - startedMs_) % period) < timing.onMs;
	}

	BuzzerPattern pattern() const { return pattern_; }

  private:
	BuzzerPattern pattern_ = BuzzerPattern::Off;
	uint32_t startedMs_ = 0;
};

}  // namespace fw
