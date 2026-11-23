/*
  Optional SSD1306 status display driver.

  The panel shares the MPU-6050 I2C bus (SDA 21 / SCL 22) at address 0x3C and
  is not part of the safety path. begin() probes the bus once; when the panel
  is absent or the init fails, every later call is a no-op and the tracker runs
  exactly as it did before the display existed.

  The update is deliberately bounded:
  - a frame is flushed only when the rendered lines changed;
  - at most one flush per kDisplayMinDrawGapMs;
  - the caller skips the display entirely while the alert state is not Idle;
  - no delay() call, and the 1 KB frame is sent as I2C bursts at 400 kHz
	(about 25 ms), so a flush cannot sit inside a countdown or an SOS.
*/
#pragma once

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <Wire.h>

#include "display_format.h"

namespace fw {

static const uint8_t kDisplayAddress = 0x3C;
static const int kDisplayWidth = 128;
static const int kDisplayHeight = 64;
static const uint32_t kDisplayMinDrawGapMs = 250;
static const uint32_t kDisplayI2cClockHz = 400000;

class StatusDisplay {
  public:
	/**
	 * Probe 0x3C and initialise the panel. Wire must already be started with
	 * the project's SDA/SCL pins. Returns false and leaves the display
	 * disabled when no panel answers, so the caller can keep running.
	 */
	bool begin() {
		if (present_) return true;
		Wire.beginTransmission(kDisplayAddress);
		if (Wire.endTransmission() != 0) return false;

		// The SSD1306 and the MPU-6050 both support 400 kHz. This is what
		// bounds a full 1024-byte flush to roughly 25 ms instead of 100 ms.
		Wire.setClock(kDisplayI2cClockHz);
		// reset=false: the modules have no ESP32 reset line wired.
		// periphBegin=false: Wire is already running with the project pins;
		// passing true would re-init the bus and reset the clock.
		if (!oled_.begin(SSD1306_SWITCHCAPVCC, kDisplayAddress, false, false)) return false;

		present_ = true;
		oled_.setTextSize(1);
		oled_.setTextColor(SSD1306_WHITE);
		oled_.clearDisplay();
		oled_.display();
		hasContent_ = false;
		return true;
	}

	bool present() const { return present_; }

	/**
	 * Draw the screen when it differs from what is already on the panel.
	 * Returns true only when a frame was actually flushed. The caller is
	 * responsible for not calling this while the alert owns the device.
	 */
	bool show(const DisplayScreen& screen, uint32_t nowMs) {
		if (!present_) return false;
		if (matches(screen)) return false;
		if (hasContent_ && (nowMs - lastDrawMs_) < kDisplayMinDrawGapMs) return false;

		oled_.clearDisplay();
		const uint8_t rows = screen.lineCount < kDisplayRows ? screen.lineCount : kDisplayRows;
		for (uint8_t row = 0; row < rows; row += 1) {
			oled_.setCursor(0, static_cast<int16_t>(row * 8));
			oled_.print(screen.lines[row]);
		}
		oled_.display();

		for (uint8_t row = 0; row < kDisplayRows; row += 1) {
			const char* source = row < screen.lineCount ? screen.lines[row] : "";
			copyDisplayText(source, drawn_[row], sizeof(drawn_[row]));
		}
		hasContent_ = true;
		lastDrawMs_ = nowMs;
		return true;
	}

  private:
	bool matches(const DisplayScreen& screen) const {
		if (!hasContent_) return false;
		for (uint8_t row = 0; row < kDisplayRows; row += 1) {
			const char* expected = row < screen.lineCount ? screen.lines[row] : "";
			if (strcmp(drawn_[row], expected) != 0) return false;
		}
		return true;
	}

	Adafruit_SSD1306 oled_{static_cast<uint8_t>(kDisplayWidth),
						   static_cast<uint8_t>(kDisplayHeight), &Wire, -1};
	bool present_ = false;
	bool hasContent_ = false;
	uint32_t lastDrawMs_ = 0;
	char drawn_[kDisplayRows][kDisplayColumns + 1] = {};
};

}  // namespace fw
