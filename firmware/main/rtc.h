/*
  Battery-backed DS3231 clock on the shared I2C bus.

  The module answers at 0x68; the MPU-6050 was moved to 0x69 by tying AD0 to
  3.3V, so both share SDA 21 / SCL 22 with the SSD1306 at 0x3C. The clock is
  optional: a missing module or a failed probe leaves present() false and every
  read returns 0, so the firmware falls back to GPS time exactly as before.

  Every call is a single bounded I2C transaction. lostPower() is sampled once in
  begin() because reading the DS3231 status register clears its oscillator-stop
  flag; caching it also keeps the alert path free of an extra bus read.
*/
#pragma once

#include <Arduino.h>
#include <RTClib.h>
#include <Wire.h>

#include "rtc_format.h"

namespace fw {

class RtcClock {
  public:
	/**
	 * Probe and initialise the module. Wire must already be started with the
	 * project's SDA/SCL pins. Returns false and leaves the clock disabled when
	 * no DS3231 answers, so the caller can keep running.
	 */
	bool begin() {
		present_ = rtc_.begin();
		if (!present_) {
			lostPower_ = false;
			return false;
		}
		lostPower_ = rtc_.lostPower();
		return true;
	}

	bool present() const { return present_; }

	/**
	 * Current UTC epoch, or 0 when the module is absent or its time is outside
	 * the plausible window. 0 means "unknown"; callers must not treat it as
	 * 1970-01-01.
	 */
	uint32_t nowEpoch() {
		if (!present_) return 0;
		const uint32_t epoch = rtc_.now().unixtime();
		return isPlausibleEpoch(epoch) ? epoch : 0;
	}

	/**
	 * Set the clock from a UTC epoch. Rejects an implausible value before any
	 * I2C write, and clears the cached oscillator-stop flag on success.
	 */
	bool setEpoch(uint32_t epoch) {
		if (!present_ || !isPlausibleEpoch(epoch)) return false;
		rtc_.adjust(DateTime(epoch));
		lostPower_ = false;
		return true;
	}

	/**
	 * True when the DS3231 reported an oscillator stop at begin(): the coin
	 * cell was replaced or the backup rail dropped. The value is cached; it
	 * does not re-read the status register on every call.
	 */
	bool lostPower() const { return lostPower_; }

  private:
	RTC_DS3231 rtc_;
	bool present_ = false;
	bool lostPower_ = false;
};

}  // namespace fw
