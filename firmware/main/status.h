#pragma once

#include <stdint.h>

namespace fw {

enum class BuzzerPattern {
	Off,
	Countdown,
	Alerting,
	Reminder,
	Cancelled,
	Fault,
};

struct PatternTiming {
	uint32_t onMs;
	uint32_t offMs;
};

// A dispatched alarm never stops on a timer. After ten minutes it drops from
// the long beep to a slower reminder beep, so the unit stays audible without a
// continuous siren until the incident is acknowledged.
constexpr uint32_t kAlertReminderAfterMs = 10UL * 60UL * 1000UL;

inline BuzzerPattern alertingPattern(uint32_t alertingElapsedMs) {
	return alertingElapsedMs >= kAlertReminderAfterMs ? BuzzerPattern::Reminder
													  : BuzzerPattern::Alerting;
}

inline PatternTiming timingFor(BuzzerPattern pattern) {
	switch (pattern) {
		case BuzzerPattern::Countdown:
			return {150, 850};
		case BuzzerPattern::Alerting:
			return {2000, 1000};
		case BuzzerPattern::Reminder:
			return {1000, 5000};
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
