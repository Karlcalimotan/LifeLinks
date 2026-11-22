/*
  Crash response policy. This is the part that must never be ambiguous:

  - A confirmed impact starts a visible countdown.
  - The driver can cancel inside the window.
  - If the window expires, the device alerts, and keeps retrying until acked.
  - Safe mode must never suppress an alert. Unlike an actuator, where refusing to
	act is the safe direction, refusing to alert after a crash is the dangerous
	direction.
*/
#pragma once

#include <stdint.h>

#include "config.h"

namespace fw {

enum class AlertState {
	Idle,
	Countdown,
	Alerting,
	Cancelled,
	PostAlert,
};

class CrashSafety {
  public:
	void startCountdown(uint32_t nowMs, const DeviceConfig& config) {
		config_ = config;
		state_ = AlertState::Countdown;
		countdownEndMs_ = nowMs + static_cast<uint32_t>(config.cancelWindowS * 1000.0f);
		lastSentMs_ = 0;
	}

	AlertState update(uint32_t nowMs, bool cancelPressed) {
		if (state_ == AlertState::Countdown) {
			if (cancelPressed) {
				state_ = AlertState::Cancelled;
				return state_;
			}
			if (nowMs >= countdownEndMs_) {
				state_ = AlertState::Alerting;
				lastSentMs_ = 0;
			}
		}
		return state_;
	}

	bool shouldRetry(uint32_t nowMs) const {
		if (state_ != AlertState::Alerting) return false;
		if (lastSentMs_ == 0) return true;
		const uint32_t retryMs = static_cast<uint32_t>(config_.sosRetryS * 1000.0f);
		return (nowMs - lastSentMs_) >= retryMs;
	}

	void markAlertSent(uint32_t nowMs) { lastSentMs_ = nowMs; }

	void markAcknowledged() { state_ = AlertState::PostAlert; }

	/**
	 * Cancel requested from the server (web or push notification).
	 *
	 * Countdown  -> Cancelled: the SOS was never sent.
	 * Alerting   -> PostAlert: stop the retry ladder immediately.
	 * Anything else is too late; the caller reports it as such instead of
	 * pretending the alert was stopped.
	 *
	 * This never suppresses an alert that has not started, and it never
	 * delays the SOS. It only ever shortens an alert the operator owns.
	 */
	bool cancelFromRemote() {
		if (state_ == AlertState::Countdown) {
			state_ = AlertState::Cancelled;
			return true;
		}
		if (state_ == AlertState::Alerting) {
			state_ = AlertState::PostAlert;
			return true;
		}
		return false;
	}

	void stopAlerting() { state_ = AlertState::PostAlert; }

	void reset() { state_ = AlertState::Idle; }

	AlertState state() const { return state_; }
	uint32_t countdownEndMs() const { return countdownEndMs_; }
	uint32_t lastSentMs() const { return lastSentMs_; }

  private:
	DeviceConfig config_{};
	AlertState state_ = AlertState::Idle;
	uint32_t countdownEndMs_ = 0;
	uint32_t lastSentMs_ = 0;
};

/**
 * Safe mode is a service policy, not an alert policy. It exists to stop
 * non-essential work after repeated resets. It must not gate the SOS path.
 */
inline bool alertingAllowed(bool /*safeMode*/) { return true; }

enum class Fault : uint8_t {
	None = 0,
	Imu = 1 << 0,
	Gps = 1 << 1,
	Modem = 1 << 2,
	Power = 1 << 3,
	CancelButton = 1 << 4,
};

class FaultManager {
  public:
	void raise(Fault fault) {
		present_ = static_cast<Fault>(static_cast<uint8_t>(present_) | static_cast<uint8_t>(fault));
		latched_ = static_cast<Fault>(static_cast<uint8_t>(latched_) | static_cast<uint8_t>(fault));
	}
	void clear(Fault fault) {
		present_ = static_cast<Fault>(static_cast<uint8_t>(present_) &
									  static_cast<uint8_t>(~static_cast<uint8_t>(fault)));
	}
	bool acknowledge() {
		if (present_ != Fault::None) return false;
		latched_ = Fault::None;
		return true;
	}
	bool hasFault() const { return latched_ != Fault::None; }
	bool isPresent(Fault fault) const {
		return (static_cast<uint8_t>(present_) & static_cast<uint8_t>(fault)) != 0;
	}

  private:
	Fault present_ = Fault::None;
	Fault latched_ = Fault::None;
};

class ResetHistory {
  public:
	void record(uint32_t nowMs, bool abnormal) {
		if (!abnormal) {
			count_ = 0;
			return;
		}
		if (count_ < kCapacity) {
			times_[count_++] = nowMs;
		} else {
			for (int index = 1; index < kCapacity; index += 1) {
				times_[index - 1] = times_[index];
			}
			times_[kCapacity - 1] = nowMs;
		}
	}

	bool shouldEnterSafeMode(uint32_t nowMs, uint32_t windowMs, int threshold) const {
		int inWindow = 0;
		for (int index = 0; index < count_; index += 1) {
			if ((nowMs - times_[index]) <= windowMs) inWindow += 1;
		}
		return inWindow >= threshold;
	}

	void clear() { count_ = 0; }
	int count() const { return count_; }

  private:
	static const int kCapacity = 8;
	uint32_t times_[kCapacity] = {0};
	int count_ = 0;
};

class MinInterval {
  public:
	explicit MinInterval(uint32_t intervalMs) : intervalMs_(intervalMs) {}
	bool ready(uint32_t nowMs) const { return lastMs_ == 0 || (nowMs - lastMs_) >= intervalMs_; }
	void mark(uint32_t nowMs) { lastMs_ = nowMs; }

  private:
	uint32_t intervalMs_;
	uint32_t lastMs_ = 0;
};

}  // namespace fw
