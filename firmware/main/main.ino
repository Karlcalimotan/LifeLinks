/*
  LifeLink tracker firmware — ESP32 DevKit V1 (30-pin).

  Flow:
	IMU + vibration + GPS -> ImpactFilter -> CrashSafety countdown
	  cancel button within the window  -> SMS/incident cancelled
	  window expires                   -> SMS to configured phones + HTTP incident
	  ACK_INCIDENT for this incident   -> alarm stops and the tracker returns to idle
	Alerting is latched: it never stops on a timer. After ten minutes the buzzer
	drops to a slower reminder pattern and the LED stays solid.
	Heartbeat and command polling run on a non-blocking interval.

  This sketch is deliberately explicit about what is verified and what still
  needs a bench check:
  - the pure logic (filters, safety, power, SMS body) is covered by native tests
  - the A7670E AT sequence, SIM/APN, GPS cold start and 4G current spikes must
	be verified on the actual hardware
  - the API base URL and provisioning token are not compiled in

  The DS3231 at 0x68 keeps the impact time across power loss. The MPU-6050 is
  strapped to 0x69 (AD0 to 3.3V) so both share the panel's 21/22 bus.

  Provision over USB serial (115200):
	SET_ID AA:BB:CC:DD:EE:01
	SET_TOKEN llk_...
	SET_PHONE1 +639171234567
	SET_PHONE2 +639181234567
	STATUS
	TIME
	SET_TIME 1704067200
  TIME prints the RTC and GPS clocks; SET_TIME takes a UTC Unix epoch.
*/
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <TinyGPSPlus.h>
#include <WebServer.h>
#include <WiFi.h>
#include <Wire.h>
#include <esp_task_wdt.h>
#include <esp_wifi.h>
#include <math.h>
#include <stdlib.h>

#include "config.h"
#include "config_apply.h"
#include "display.h"
#include "filters.h"
#include "gps.h"
#include "hardware.h"
#include "modem.h"
#include "power.h"
#include "provisioning.h"
#include "rtc.h"
#include "safety.h"
#include "status.h"

#if __has_include("secrets.h")
#include "secrets.h"
#endif

#ifndef FW_VERSION
#define FW_VERSION "0.3.1"
#endif

#ifndef LIFELINK_API_BASE
#define LIFELINK_API_BASE "https://lifelink.example.com"
#endif

// Hardware watchdog. The sketch subscribes the loop task explicitly; ESP-IDF
// startup already watches idle0, which does not cover this sketch's loop.
//
// Timeout budget, from the blocking A7670E transport:
//   - the longest single AT wait is 30 s (AT+HTTPACTION);
//   - one complete modemHttpRequest() can spend at most 87 s across its steps;
//   - a heartbeat or LOCATE adds the 3 s AT+CSQ signal query, so a bounded
//     modem phase is about 90 s.
// 120 s leaves 30 s of margin over that phase. The longest boot step is the
// ~11 s modem PWRKEY sequence, below the same timeout. If any modem step grows,
// raise this constant in the same change.
static const uint32_t kWatchdogTimeoutS = 120;
static_assert(kWatchdogTimeoutS * 1000UL > 90000UL,
			  "watchdog timeout must exceed one worst-case modem phase");

bool g_watchdogActive = false;

void beginWatchdog() {
	const esp_err_t initialized = esp_task_wdt_init(kWatchdogTimeoutS, true);
	if (initialized != ESP_OK) {
		Serial.printf(
			"[WDT] esp_task_wdt_init failed (%d); continuing without a configured task watchdog\n",
			static_cast<int>(initialized));
		return;
	}
	const esp_err_t subscribed = esp_task_wdt_add(nullptr);
	if (subscribed != ESP_OK) {
		Serial.printf("[WDT] watchdog initialized at %lus but esp_task_wdt_add failed (%d); "
					  "loop task not watched\n",
					  static_cast<unsigned long>(kWatchdogTimeoutS), static_cast<int>(subscribed));
		return;
	}
	g_watchdogActive = true;
	Serial.printf("[WDT] task watchdog %lus, panic on, loop task subscribed\n",
				  static_cast<unsigned long>(kWatchdogTimeoutS));
}

// Call only after a bounded phase has returned. A feed inside a wait would hide
// exactly the hang this watchdog exists to catch.
void feedWatchdog() {
	if (!g_watchdogActive) return;
	esp_task_wdt_reset();
}

TinyGPSPlus gps;
Adafruit_MPU6050 mpu;
fw::RtcClock g_rtc;
Preferences prefs;
HardwareSerial gpsSerial(1);
HardwareSerial modemSerial(2);

fw::DeviceConfig g_config = fw::defaultConfig();
fw::ImpactFilter g_filter(g_config);
fw::CrashSafety g_safety;
fw::BuzzerController g_buzzer;
fw::FaultManager g_faults;
fw::Debouncer g_cancelDebouncer(50, false);
fw::MinInterval g_heartbeatTimer(30 * 1000);
fw::MinInterval g_commandTimer(5 * 1000);
// The GPS -> RTC correction is a maintenance task, not a safety task: once an
// hour is enough to bound drift, and the write never runs during an alert.
fw::MinInterval g_rtcSyncTimer(60UL * 60UL * 1000UL);

String g_deviceId;
String g_deviceToken;
// Optional, read-only: no flow writes this key yet, so the home screen omits
// the UUID line unless one already exists.
String g_deviceUuid;
uint32_t g_configRev = 0;
String g_pendingConfig;
uint32_t g_pendingRev = 0;
bool g_configPending = false;
bool g_mpuOk = false;

// Optional status panel. It is never part of the safety path; see display.h.
fw::StatusDisplay g_display;
fw::DisplayWifiState g_homeWifiState = fw::DisplayWifiState::Setup;
String g_activeWifiSsid;
String g_wifiOkSsid;
char g_wifiOkIp[fw::kIpv4TextMax] = {0};
uint32_t g_wifiOkUntilMs = 0;

fw::AlertState g_lastState = fw::AlertState::Idle;
uint32_t g_cancelledAt = 0;
uint32_t g_postAlertAt = 0;
uint32_t g_alertStartedAt = 0;
uint32_t g_testAlertUntil = 0;
bool g_allClearPending = false;

String g_incidentId;
uint32_t g_detectedAt = 0;
// The moment the countdown expired and the emergency alert started, derived
// from the countdown deadline rather than from the observation time. Captured
// once per incident, from the same GPS clock as g_detectedAt, and never
// replaced by a retry: the console measures transmission time from this value.
uint32_t g_sentAt = 0;
float g_peakAccel = 0.0f;
float g_peakTilt = 0.0f;
int g_vibrationCount = 0;

struct Sample {
	uint32_t t;
	float accelG;
	float tiltDeg;
};
static const int kSampleCapacity = 32;
Sample g_samples[kSampleCapacity];
int g_sampleCount = 0;

uint32_t g_lastImuMs = 0;
uint32_t g_lastGpsLogMs = 0;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

String chipMac() {
	uint64_t mac = ESP.getEfuseMac();
	char buffer[18];
	snprintf(buffer, sizeof(buffer), "%02X:%02X:%02X:%02X:%02X:%02X",
			 static_cast<uint8_t>((mac >> 40) & 0xFF), static_cast<uint8_t>((mac >> 32) & 0xFF),
			 static_cast<uint8_t>((mac >> 24) & 0xFF), static_cast<uint8_t>((mac >> 16) & 0xFF),
			 static_cast<uint8_t>((mac >> 8) & 0xFF), static_cast<uint8_t>(mac & 0xFF));
	return String(buffer);
}

String newIncidentId() {
	char buffer[40];
	snprintf(buffer, sizeof(buffer), "llk-%08lx-%08lx", static_cast<unsigned long>(esp_random()),
			 static_cast<unsigned long>(millis()));
	return String(buffer);
}

uint32_t gpsEpochSeconds() {
	if (!gps.date.isValid() || !gps.time.isValid()) return 0;
	const int year = gps.date.year();
	const int month = gps.date.month();
	const int day = gps.date.day();
	const int hour = gps.time.hour();
	const int minute = gps.time.minute();
	const int second = gps.time.second();
	if (year < 2024 || month < 1 || month > 12 || day < 1 || day > 31) return 0;

	static const int daysInMonth[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
	uint32_t days = 0;
	for (int y = 1970; y < year; y += 1) {
		days += 365;
		if ((y % 4 == 0 && y % 100 != 0) || y % 400 == 0) days += 1;
	}
	for (int m = 1; m < month; m += 1) {
		days += daysInMonth[m - 1];
		if (m == 2 && ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0)) days += 1;
	}
	days += static_cast<uint32_t>(day - 1);
	return days * 86400UL + static_cast<uint32_t>(hour * 3600 + minute * 60 + second);
}

/**
 * Wall-clock time for an incident: the battery-backed RTC first, the GPS fix
 * second, 0 when neither knows the time. Callers use it at transitions and for
 * the display; it is never read from the 20 ms sample loop.
 */
uint32_t bestEpochSeconds() {
	const uint32_t rtcEpoch = g_rtc.nowEpoch();
	if (rtcEpoch > 0) return rtcEpoch;
	return gpsEpochSeconds();
}

/**
 * Bounded GPS -> RTC correction. The DS3231 drifts slowly, so an hourly check
 * is enough; a write happens only when the clock was lost, is unset, or is more
 * than five seconds away from GPS. It is skipped outside Idle so this
 * maintenance write never lands inside the countdown or the SOS retry. No loop
 * waits.
 */
void serviceRtcSync(uint32_t now) {
	if (!g_rtc.present()) return;
	if (g_safety.state() != fw::AlertState::Idle) return;
	if (!g_rtcSyncTimer.ready(now)) return;

	const uint32_t gpsEpoch = gpsEpochSeconds();
	if (!fw::isPlausibleEpoch(gpsEpoch)) return;  // no fix yet; check again next pass

	const uint32_t rtcEpoch = g_rtc.nowEpoch();
	const uint32_t drift = rtcEpoch > gpsEpoch ? rtcEpoch - gpsEpoch : gpsEpoch - rtcEpoch;
	const bool needsSync = g_rtc.lostPower() || rtcEpoch == 0 || drift > 5;

	// Mark even when no write is needed: the next comparison is an hour away,
	// which keeps the shared bus free for the IMU and the panel.
	g_rtcSyncTimer.mark(now);
	if (!needsSync) return;
	if (!g_rtc.setEpoch(gpsEpoch)) return;

	char clock[fw::kClockHmsTextMax];
	if (!fw::formatClockHms(gpsEpoch, clock, sizeof(clock))) {
		Serial.printf("[RTC] synced from GPS epoch=%lu\n", static_cast<unsigned long>(gpsEpoch));
		return;
	}
	Serial.printf("[RTC] synced from GPS to %s UTC\n", clock);
}

void pushSample(uint32_t t, float accelG, float tiltDeg) {
	if (g_sampleCount < kSampleCapacity) {
		g_samples[g_sampleCount++] = {t, accelG, tiltDeg};
	} else {
		for (int index = 1; index < kSampleCapacity; index += 1) {
			g_samples[index - 1] = g_samples[index];
		}
		g_samples[kSampleCapacity - 1] = {t, accelG, tiltDeg};
	}
}

// ---------------------------------------------------------------------------
// Modem (A7670E) — AT transport
// ---------------------------------------------------------------------------

void modemDrain() {
	while (modemSerial.available()) modemSerial.read();
}

String readModemLine(uint32_t timeoutMs) {
	String line;
	const uint32_t started = millis();
	while ((millis() - started) < timeoutMs) {
		while (modemSerial.available()) {
			const char c = static_cast<char>(modemSerial.read());
			if (c == '\n') {
				line.trim();
				return line;
			}
			if (c != '\r') line += c;
		}
		delay(1);
	}
	line.trim();
	return line;
}

bool waitForToken(const char* token, uint32_t timeoutMs) {
	String accumulator;
	const uint32_t started = millis();
	while ((millis() - started) < timeoutMs) {
		while (modemSerial.available()) {
			accumulator += static_cast<char>(modemSerial.read());
			if (accumulator.indexOf(token) >= 0) return true;
			if (accumulator.length() > 512) {
				accumulator.remove(0, accumulator.length() - 256);
			}
		}
		delay(1);
	}
	return false;
}

bool readUntilPrefix(const char* prefix, String& out, uint32_t timeoutMs) {
	const uint32_t started = millis();
	while ((millis() - started) < timeoutMs) {
		const String line = readModemLine(500);
		if (line.startsWith(prefix)) {
			out = line;
			return true;
		}
	}
	return false;
}

bool modemCommand(const char* command, const char* expected, uint32_t timeoutMs) {
	modemSerial.println(command);
	return waitForToken(expected, timeoutMs);
}

void modemPowerOn() {
	pinMode(hw::kModemPwrKey, OUTPUT);
	// The A7670E PWRKEY is active LOW and idles HIGH. Drive it high first so the
	// module is not held in the power-key state while the ESP32 boots.
	digitalWrite(hw::kModemPwrKey, HIGH);
	delay(200);

	modemDrain();
	if (modemCommand("AT", "OK", 2000)) {
		Serial.println("[MODEM] already awake");
		return;
	}

	// Pulse low for at least 1 s, then release. Do not leave it low: that holds
	// the power key and can power the module straight back off.
	digitalWrite(hw::kModemPwrKey, LOW);
	delay(1200);
	digitalWrite(hw::kModemPwrKey, HIGH);
	delay(5000);

	if (!modemCommand("AT", "OK", 3000)) {
		Serial.println("[MODEM] no AT response");
		g_faults.raise(fw::Fault::Modem);
	}
}

int modemSignalDbm() {
	modemDrain();
	modemSerial.println("AT+CSQ");
	String line;
	if (!readUntilPrefix("+CSQ:", line, 3000)) return -127;
	int rssi = 99;
	int ber = 0;
	if (sscanf(line.c_str(), "+CSQ: %d,%d", &rssi, &ber) != 2) return -127;
	if (rssi == 99 || rssi < 0) return -127;
	return -113 + 2 * rssi;
}

bool modemHttpRequest(const char* method, const char* path, const String& body, String* response) {
	if (g_deviceToken.isEmpty()) return false;

	modemDrain();
	modemCommand("AT+HTTPINIT", "OK", 3000);
	modemCommand("AT+HTTPPARA=\"CID\",1", "OK", 2000);

	const String url = String(LIFELINK_API_BASE) + path;
	modemSerial.print("AT+HTTPPARA=\"URL\",\"");
	modemSerial.print(url);
	modemSerial.println("\"");
	if (!waitForToken("OK", 3000)) return false;

	// The A7670E supports custom HTTP headers on current firmware. Verify this
	// exact parameter on the bench; some module revisions expect a different key.
	modemSerial.print("AT+HTTPPARA=\"USER_DEFINED\",\"x-device-token: ");
	modemSerial.print(g_deviceToken);
	modemSerial.println("\"");
	waitForToken("OK", 2000);

	if (strncmp(LIFELINK_API_BASE, "https://", 8) == 0) {
		modemCommand("AT+HTTPSSL=1", "OK", 2000);
	}

	if (strcmp(method, "POST") == 0) {
		modemCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK", 2000);
		modemSerial.print("AT+HTTPDATA=");
		modemSerial.print(body.length());
		modemSerial.println(",10000");
		if (!waitForToken("DOWNLOAD", 5000)) return false;
		modemSerial.print(body);
		if (!waitForToken("OK", 10000)) return false;
	}

	modemSerial.println(strcmp(method, "POST") == 0 ? "AT+HTTPACTION=1" : "AT+HTTPACTION=0");
	String actionLine;
	if (!readUntilPrefix("+HTTPACTION:", actionLine, 30000)) return false;

	int action = 0;
	int status = 0;
	int length = 0;
	if (sscanf(actionLine.c_str(), "+HTTPACTION: %d,%d,%d", &action, &status, &length) != 3) {
		return false;
	}

	if (response != nullptr && length > 0) {
		modemSerial.print("AT+HTTPREAD=0,");
		modemSerial.println(length);
		String header;
		readUntilPrefix("+HTTPREAD:", header, 10000);
		response->reserve(length);
		const uint32_t started = millis();
		while (response->length() < static_cast<unsigned>(length) && (millis() - started) < 15000) {
			while (modemSerial.available() && response->length() < static_cast<unsigned>(length)) {
				*response += static_cast<char>(modemSerial.read());
			}
			delay(1);
		}
	}

	modemCommand("AT+HTTPTERM", "OK", 3000);
	return status >= 200 && status < 300;
}

bool sendSms(const String& number, const String& body) {
	if (number.isEmpty()) return false;
	modemDrain();
	if (!modemCommand("AT+CMGF=1", "OK", 2000)) return false;

	modemSerial.print("AT+CMGS=\"");
	modemSerial.print(number);
	modemSerial.println("\"");
	if (!waitForToken(">", 5000)) return false;

	modemSerial.print(body);
	modemSerial.write(26);
	return waitForToken("+CMGS", 20000);
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

bool parseConfigObject(JsonObject config, fw::DeviceConfig& out, uint32_t& rev) {
	if (config.isNull()) return false;
	if (!config["version"].is<int>() || config["version"].as<int>() != fw::kConfigContractVersion) {
		return false;
	}

	fw::DeviceConfig next = g_config;
#define FW_APPLY(name, key, min, max, integer, def) \
	if (!config[key].isNull()) next.name = config[key].as<float>();
	FW_CONFIG_FIELDS(FW_APPLY)
#undef FW_APPLY

	if (!fw::validateConfig(next)) return false;
	out = next;
	rev = config["rev"] | 0;
	return true;
}

void applyDeviceConfig(const fw::DeviceConfig& next, uint32_t rev, bool persist,
					   const String& raw) {
	g_config = next;
	g_filter.setConfig(next);
	g_heartbeatTimer =
		fw::MinInterval(static_cast<uint32_t>(g_config.heartbeatIntervalS * 1000.0f));
	g_heartbeatTimer.mark(millis());
	g_configRev = rev;
	if (persist) {
		prefs.putString("cfg_json", raw);
		prefs.putUInt("cfg_rev", rev);
	}
}

bool applyConfigObject(JsonObject config, bool persist) {
	fw::DeviceConfig next;
	uint32_t rev = 0;
	if (!parseConfigObject(config, next, rev)) {
		Serial.println("[CFG] rejected: version or envelope");
		return false;
	}
	String raw;
	serializeJson(config, raw);
	applyDeviceConfig(next, rev, persist, raw);
	return true;
}

/**
 * Queue a config for the next Idle tick. The object is validated now, so an
 * out-of-envelope payload is rejected immediately and the last-good config
 * stays active. It is not applied until the alert state is Idle.
 */
bool queueConfigObject(JsonObject config) {
	fw::DeviceConfig next;
	uint32_t rev = 0;
	if (!parseConfigObject(config, next, rev)) {
		Serial.println("[CFG] rejected: version or envelope");
		return false;
	}
	serializeJson(config, g_pendingConfig);
	g_pendingRev = rev;
	g_configPending = true;
	return true;
}

void applyPendingConfig() {
	if (!g_configPending) return;
	if (!fw::canApplyConfig(g_safety.state())) return;

	JsonDocument doc;
	if (deserializeJson(doc, g_pendingConfig) != DeserializationError::Ok) {
		g_configPending = false;
		return;
	}
	if (!applyConfigObject(doc.as<JsonObject>(), true)) {
		g_configPending = false;
		return;
	}
	g_configPending = false;
	Serial.printf("[CFG] applied queued rev=%lu\n", static_cast<unsigned long>(g_configRev));
}

void loadConfig() {
	g_config = fw::defaultConfig();
	g_configRev = 0;
	const String raw = prefs.getString("cfg_json", "");
	if (raw.isEmpty()) return;
	JsonDocument doc;
	if (deserializeJson(doc, raw) != DeserializationError::Ok) return;
	JsonObject object = doc.as<JsonObject>();
	// A boot load applies without rewriting NVS. Invalid stored data falls back
	// to the factory defaults rather than pinning a broken object.
	if (!applyConfigObject(object, false)) {
		g_config = fw::defaultConfig();
		g_configRev = 0;
	}
	g_filter.setConfig(g_config);
}

// ---------------------------------------------------------------------------
// WiFi commissioning portal
// ---------------------------------------------------------------------------
//
// WiFi is commissioning-only. The tracker's telemetry, SOS and command paths
// stay on the A7670E; the radio is used to prove a network and collect the
// device identity, then it is switched off. The portal is opened only when the
// unit is not provisioned or after three failed joins of the stored network,
// and it closes after a proven save or after ten minutes.
//
// The page never renders a password or token back into HTML or JSON, and this
// file never logs either value.

static const uint32_t kPortalCloseDelayMs = 2000;
static const uint32_t kStoredWifiRetryGapMs = 2000;
static const uint32_t kScanTimeoutMs = 12000;
static const uint32_t kScanRetryDelayMs = 2000;
static const int kMaxScannedNetworks = 20;

WebServer g_portalServer(80);
DNSServer g_portalDns;
bool g_portalActive = false;
bool g_portalRoutesRegistered = false;
uint32_t g_portalStartedMs = 0;
uint32_t g_portalStopAtMs = 0;
String g_portalApName;

struct ScannedNetwork {
	String ssid;
	int32_t rssi;
	bool secure;
};
ScannedNetwork g_scannedNetworks[kMaxScannedNetworks];
int g_scannedNetworkCount = 0;

enum class PortalScanState : uint8_t {
	Idle,
	Running,
	RetryWait,
};
PortalScanState g_portalScanState = PortalScanState::Idle;
uint32_t g_portalScanStartedMs = 0;
uint32_t g_portalScanRetryAtMs = 0;
bool g_portalScanRetried = false;
int g_portalScanLastError = 0;

enum class PortalJoinState : uint8_t {
	Idle,
	Testing,
	Connected,
	Failed,
};
PortalJoinState g_portalJoinState = PortalJoinState::Idle;
uint32_t g_portalJoinStartedMs = 0;
String g_portalPendingSsid;
String g_portalPendingPass;
String g_portalPendingDeviceId;
String g_portalPendingToken;
String g_portalJoinDetail;
String g_portalJoinMessage;
String g_portalFormError;

enum class StoredWifiState : uint8_t {
	Idle,
	Joining,
	RetryWait,
	Done,
};
StoredWifiState g_storedWifiState = StoredWifiState::Idle;
bool g_storedWifiCheckActive = false;
uint8_t g_storedWifiAttempts = 0;
uint32_t g_storedWifiStartedMs = 0;
uint32_t g_storedWifiRetryAtMs = 0;

fw::BootResetSequence g_bootReset;
fw::BootResetSequence g_factoryReset;
bool g_provisioned = false;	 // NVS marker written only after a proven join

void collectScannedNetworks(int found);
void finishPortalScan(int count, bool failed);
void stopProvisioningPortal(const char* reason);

static const char kPortalStyle[] PROGMEM = R"css(
:root{--ink:#071013;--panel:#0d1c21;--panel2:#122a30;--line:#1a3a42;--fog:#e8f1f2;--muted:#8fa3a6;--signal:#ff5a1f;--signal2:#ff7a45;--on-signal:#071013}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ink);color:var(--fog);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.45}
header.bar{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line);background:var(--panel)}
.mark{width:34px;height:34px;flex:none}
.word{font-weight:800;font-size:1.2rem;letter-spacing:.01em}
.tag{margin-left:auto;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
main{max-width:520px;margin:0 auto;padding:18px 16px 8px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:inset 0 1px 0 rgb(255 255 255 / .04)}
h1{font-size:1.35rem;margin:0 0 4px}
.lede{margin:0 0 14px;color:var(--muted);font-size:.95rem}
h2{font-size:1rem;margin:22px 0 8px;display:flex;align-items:center;gap:8px}
.step{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--signal);color:var(--on-signal);font-size:.8rem;font-weight:800}
label{display:block;font-weight:650;margin:14px 0 6px;font-size:.92rem}
input{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--ink);color:var(--fog);font-size:1rem}
input:focus,button:focus-visible,a:focus-visible{outline:2px solid var(--signal2);outline-offset:2px}
.note,.hint{margin:8px 0 0;color:var(--muted);font-size:.83rem}
.hint{margin:5px 0 0}
.error{margin:12px 0 0;padding:10px 12px;border:1px solid #7a2a26;border-radius:10px;background:#2a1210;color:#ffb4ae;font-size:.9rem}
.ok{margin:12px 0 0;padding:10px 12px;border:1px solid #1e6b4d;border-radius:10px;background:#0d2a20;color:#9bf0ca;font-size:.9rem}
.empty{margin:10px 0;color:var(--muted);font-size:.9rem}
.networks{display:grid;gap:8px;margin-top:10px}
.net{display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2);color:inherit;text-align:left;font:inherit;cursor:pointer}
.net:hover{border-color:var(--signal)}
.name{flex:1;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{flex:none;color:var(--muted);font-size:.76rem}
.bars{display:inline-flex;align-items:flex-end;gap:2px;height:14px;flex:none}
.bars i{width:3px;border-radius:1px;background:#3a4c5e}
.bars i:nth-child(1){height:4px}.bars i:nth-child(2){height:7px}.bars i:nth-child(3){height:10px}.bars i:nth-child(4){height:14px}
.bars.s1 i:nth-child(1),.bars.s2 i:nth-child(-n+2),.bars.s3 i:nth-child(-n+3),.bars.s4 i{background:var(--signal)}
.scanline{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;color:var(--muted);font-size:.83rem}
.btn{display:block;width:100%;margin-top:16px;padding:13px;border:0;border-radius:10px;font:inherit;font-weight:750;text-align:center;text-decoration:none;cursor:pointer}
.btn.primary{background:var(--signal);color:var(--on-signal)}
.btn.ghost{background:transparent;color:var(--fog);border:1px solid var(--line)}
.btn.small{display:inline-block;width:auto;margin:0;padding:7px 12px;font-size:.82rem}
.spinner{width:34px;height:34px;margin:20px auto;border:3px solid var(--line);border-top-color:var(--signal);border-radius:50%;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.facts{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:14px 0 0;font-size:.9rem}
dt{color:var(--muted)}dd{margin:0;font-weight:650;word-break:break-all}
footer{max-width:520px;margin:0 auto;padding:14px 16px 30px;color:var(--muted);font-size:.78rem}
footer code{background:var(--panel2);padding:1px 5px;border-radius:4px;color:var(--fog)}
[hidden]{display:none!important}
@media (prefers-color-scheme:light){:root{--ink:#f4fbfc;--panel:#fff;--panel2:#e8f1f2;--line:#c9d8da;--fog:#071013;--muted:#526a6d}}
)css";

static const char kPortalMark[] PROGMEM =
	"<svg class=\"mark\" viewBox=\"0 0 64 64\" aria-hidden=\"true\">"
	"<path d=\"M4 0h46l14 14v46a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z\" fill=\"#FF5A1F\"/>"
	"<path d=\"M14 20v24h10l5-19 6 25 5-12h10\" stroke=\"#071013\" stroke-width=\"5.5\" "
	"stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
	"</svg>";

String htmlEscape(const String& value) {
	String out;
	out.reserve(value.length() + 16);
	for (size_t index = 0; index < value.length(); index += 1) {
		switch (value[index]) {
			case '&':
				out += F("&amp;");
				break;
			case '<':
				out += F("&lt;");
				break;
			case '>':
				out += F("&gt;");
				break;
			case '"':
				out += F("&quot;");
				break;
			case '\'':
				out += F("&#39;");
				break;
			default:
				out += value[index];
				break;
		}
	}
	return out;
}

String portalDeviceIdForDisplay() {
	if (fw::isValidStoredDeviceId(g_deviceId.c_str())) return g_deviceId;
	return chipMac();
}

String portalApName() {
	if (!g_portalApName.isEmpty()) return g_portalApName;
	char name[fw::kProvisioningApNameMax];
	const String mac = chipMac();
	if (!fw::provisioningApName(mac.c_str(), name, sizeof(name))) return String("LifeLink-0000");
	return String(name);
}

bool portalScanInProgress() {
	return g_portalScanState == PortalScanState::Running ||
		   g_portalScanState == PortalScanState::RetryWait;
}

int signalBarsForRssi(int32_t rssi) {
	if (rssi > -55) return 4;
	if (rssi > -67) return 3;
	if (rssi > -78) return 2;
	return 1;
}

String portalPageHead(const char* title) {
	String page;
	page.reserve(4096);
	page += F(
		"<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">"
		"<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">"
		"<meta name=\"theme-color\" content=\"#071013\">"
		"<meta name=\"robots\" content=\"noindex\"><title>");
	page += title;
	page += F("</title><style>");
	page += FPSTR(kPortalStyle);
	page += F("</style></head><body><header class=\"bar\">");
	page += FPSTR(kPortalMark);
	page +=
		F("<span class=\"word\">LifeLink</span><span class=\"tag\">device setup</span></header>");
	return page;
}

String portalFooter() {
	String page;
	page.reserve(400);
	page += F("<footer><div>Device ID <code>");
	page += htmlEscape(portalDeviceIdForDisplay());
	page += F("</code></div><div>Setup AP <code>");
	page += htmlEscape(portalApName());
	page += F("</code> &middot; Portal <code>");
	page += WiFi.softAPIP().toString();
	page += F("</code></div><div>Firmware ");
	page += F(FW_VERSION);
	page += F(" &middot; WiFi is for commissioning only. This page closes after 10 minutes.</div>"
			  "</footer>");
	return page;
}

String buildNetworkRows() {
	String rows;
	rows.reserve(120 + static_cast<size_t>(g_scannedNetworkCount) * 220);
	for (int index = 0; index < g_scannedNetworkCount; index += 1) {
		const ScannedNetwork& network = g_scannedNetworks[index];
		rows += F("<button type=\"button\" class=\"net\" data-ssid=\"");
		rows += htmlEscape(network.ssid);
		rows += F("\"><span class=\"bars s");
		rows += String(signalBarsForRssi(network.rssi));
		rows += F("\" aria-hidden=\"true\"><i></i><i></i><i></i><i></i></span>"
				  "<span class=\"name\">");
		rows += htmlEscape(network.ssid);
		rows += F("</span>");
		rows += network.secure ? F("<span class=\"meta\">Locked</span>")
							   : F("<span class=\"meta\">Open</span>");
		rows += F("<span class=\"meta\">");
		rows += String(network.rssi);
		rows += F(" dBm</span></button>");
	}
	return rows;
}

String portalScanHint() {
	if (g_portalScanState == PortalScanState::Running) return String(F("Scanning..."));
	if (g_portalScanState == PortalScanState::RetryWait) return String(F("Scanning..."));
	if (g_scannedNetworkCount > 0) {
		return String(g_scannedNetworkCount) + F(" network(s) found");
	}
	if (g_portalScanLastError != 0) return String(F("Scan failed. Tap Rescan."));
	return String(F("No networks found. Tap Rescan."));
}

String portalSetupScript() {
	return String(R"js(
<script>(function(){
var list=document.getElementById('networks');
var hint=document.getElementById('scanhint');
var rescan=document.getElementById('rescan');
var ssid=document.getElementById('ssid');
if(!list||!ssid)return;
var esc=function(v){return String(v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var bars=function(n){return '<span class="bars s'+n+'" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';};
var level=function(r){return r>-55?4:r>-67?3:r>-78?2:1;};
var render=function(nets){
 var h='';
 if(!nets.length){h='<p class="empty">No networks found. Move closer to the router, then tap Rescan.</p>';}
 for(var i=0;i<nets.length;i++){var n=nets[i];
  h+='<button type="button" class="net" data-ssid="'+esc(n.ssid)+'">'+bars(level(n.rssi))+
     '<span class="name">'+esc(n.ssid)+'</span>'+(n.secure?'<span class="meta">Locked</span>':'<span class="meta">Open</span>')+
     '<span class="meta">'+n.rssi+' dBm</span></button>';
 }
 h+='<button type="button" class="btn ghost small" id="manual">Type it manually</button>';
 list.innerHTML=h;
 hint.textContent=nets.length?(nets.length+' network(s) found'):'No networks found';
};
var refresh=function(){
 fetch('/scan',{cache:'no-store'}).then(function(r){return r.json();}).then(function(j){
  if(j.scanning){hint.textContent='Scanning\u2026';setTimeout(refresh,900);return;}
  render(j.networks||[]);
 }).catch(function(){hint.textContent='Scan failed. Tap Rescan.';});
};
list.addEventListener('click',function(e){
 var t=e.target;
 while(t&&t!==list&&(' '+t.className+' ').indexOf(' net ')===-1)t=t.parentNode;
 if(t&&t!==list){ssid.value=t.getAttribute('data-ssid')||'';ssid.focus();}
 if(e.target&&e.target.id==='manual'){ssid.value='';ssid.focus();}
});
if(rescan)rescan.addEventListener('click',function(){
 rescan.disabled=true;hint.textContent='Scanning\u2026';
 fetch('/scan',{method:'POST',cache:'no-store'}).then(function(r){return r.json();})
 .then(function(){setTimeout(refresh,600);})
 .catch(function(){hint.textContent='Scan failed. Tap Rescan.';})
 .then(function(){rescan.disabled=false;});
});
refresh();
})();</script>
)js");
}

String portalStatusScript() {
	return String(R"js(
<script>(function(){
var state=document.getElementById('state');
var msg=document.getElementById('msg');
var spin=document.getElementById('spin');
var facts=document.getElementById('facts');
var err=document.getElementById('err');
var done=document.getElementById('done');
var back=document.getElementById('back');
var fSsid=document.getElementById('f-ssid');
var fIp=document.getElementById('f-ip');
var fRssi=document.getElementById('f-rssi');
var stopped=false;
var dbm=function(v){return v<0?('\u2212'+Math.abs(v)+' dBm'):(v+' dBm');};
var tick=function(){
 fetch('/status',{cache:'no-store'}).then(function(r){return r.json();}).then(function(j){
  if(j.state==='connected'){
   stopped=true;state.textContent='Connected';
   msg.textContent='The tracker joined the network and saved the settings.';
   fSsid.textContent=j.ssid;fIp.textContent=j.ip;fRssi.textContent=dbm(j.rssi);
   facts.hidden=false;spin.hidden=true;err.hidden=true;
   done.textContent='Setup complete. The setup portal will close now.';done.hidden=false;
   return;
  }
  if(j.state==='failed'){
   stopped=true;state.textContent='Not connected';
   msg.textContent='The tracker could not join that network.';
   err.textContent=j.message||'Check the name and password, then try again.';
   err.hidden=false;spin.hidden=true;back.hidden=false;
   return;
  }
  setTimeout(tick,700);
 }).catch(function(){if(!stopped)setTimeout(tick,1200);});
};
tick();
})();</script>
)js");
}

String buildPortalPage(const String& ssid, const String& error) {
	const bool hasStoredToken = fw::isValidStoredToken(g_deviceToken.c_str());
	const bool hasPendingToken = fw::isValidStoredToken(g_portalPendingToken.c_str());
	const char* tokenHint =
		hasStoredToken ? "Leave blank to keep the saved token."
					   : (hasPendingToken ? "Kept from the last attempt; leave blank to reuse it."
										  : "Required for first-time setup.");
	String page = portalPageHead("LifeLink device setup");
	page.reserve(9000);
	page += F("<main><section class=\"card\"><h1>Device setup</h1>"
			  "<p class=\"lede\">Join this tracker to a 2.4 GHz Wi-Fi network and register its "
			  "identity. The tracker tests the network before saving anything.</p>");
	if (!error.isEmpty()) {
		page += F("<p class=\"error\">");
		page += htmlEscape(error);
		page += F("</p>");
	}
	page += F("<h2><span class=\"step\">1</span> Wi-Fi network</h2>"
			  "<p class=\"note\">Choose a network below or type its name. The list covers 2.4 GHz "
			  "networks only.</p><div class=\"networks\" id=\"networks\">");
	if (portalScanInProgress()) page += F("<p class=\"note\">Scanning for nearby networks...</p>");
	if (g_scannedNetworkCount > 0) {
		page += buildNetworkRows();
	} else if (!portalScanInProgress()) {
		page += F("<p class=\"empty\">No networks found. Move closer to the router, then tap "
				  "Rescan.</p>");
	}
	page += F("</div><div class=\"scanline\"><span id=\"scanhint\">");
	page += portalScanHint();
	page += F("</span><button type=\"button\" class=\"btn ghost small\" id=\"rescan\">Rescan"
			  "</button></div>"
			  "<form method=\"post\" action=\"/save\" id=\"setupform\">"
			  "<label for=\"ssid\">Wi-Fi name (SSID)</label>"
			  "<input id=\"ssid\" name=\"ssid\" type=\"text\" maxlength=\"32\" required "
			  "autocomplete=\"off\" autocapitalize=\"none\" spellcheck=\"false\" value=\"");
	page += htmlEscape(ssid);
	page += F("\"><p class=\"hint\">Names are case-sensitive.</p>"
			  "<label for=\"pass\">Password</label>"
			  "<input id=\"pass\" name=\"pass\" type=\"password\" maxlength=\"63\" "
			  "autocomplete=\"new-password\" autocapitalize=\"none\" spellcheck=\"false\">"
			  "<p class=\"hint\">Leave empty for an open network; otherwise 8-63 characters. "
			  "The password is never shown again.</p>"
			  "<h2><span class=\"step\">2</span> Device identity</h2>"
			  "<p class=\"note\">Find these in the LifeLink dashboard under Devices. The Device ID "
			  "is this unit's Wi-Fi MAC.</p>"
			  "<label for=\"device_id\">Device ID</label>"
			  "<input id=\"device_id\" name=\"device_id\" type=\"text\" maxlength=\"64\" required "
			  "autocomplete=\"off\" autocapitalize=\"none\" spellcheck=\"false\" value=\"");
	page += htmlEscape(portalDeviceIdForDisplay());
	page +=
		F("\"><label for=\"device_token\">Device Token</label>"
		  "<input id=\"device_token\" name=\"device_token\" type=\"password\" maxlength=\"128\" "
		  "autocomplete=\"new-password\" autocapitalize=\"none\" spellcheck=\"false\">"
		  "<p class=\"hint\">");
	page += tokenHint;
	page += F("</p><button class=\"btn primary\" type=\"submit\">Connect and save</button>"
			  "</form><p class=\"note\">The tracker joins the network and waits for an IP address "
			  "before writing to flash. If the join fails, the portal stays open, the stored "
			  "credentials are unchanged, and the reason is shown here.</p></section></main>");
	page += portalFooter();
	page += portalSetupScript();
	page += F("</body></html>");
	return page;
}

String buildPortalStatusPage() {
	String page = portalPageHead("LifeLink connecting");
	page.reserve(3500);
	page += F("<main><section class=\"card\"><h1 id=\"state\">Connecting...</h1>"
			  "<p class=\"lede\" id=\"msg\">Testing <strong>");
	page += htmlEscape(g_portalPendingSsid);
	page += F("</strong>. This can take up to 20 seconds.</p>"
			  "<div class=\"spinner\" id=\"spin\" aria-hidden=\"true\"></div>"
			  "<dl class=\"facts\" id=\"facts\" hidden><dt>Network</dt><dd id=\"f-ssid\">-</dd>"
			  "<dt>IP address</dt><dd id=\"f-ip\">-</dd><dt>Signal</dt><dd id=\"f-rssi\">-</dd>"
			  "</dl><p class=\"error\" id=\"err\" hidden></p><p class=\"ok\" id=\"done\" "
			  "hidden></p><a class=\"btn ghost\" id=\"back\" href=\"/\" hidden>Back to "
			  "setup</a></section></main>");
	page += portalFooter();
	page += portalStatusScript();
	page += F("</body></html>");
	return page;
}

void sendPortalHtml(int code, const String& page) {
	g_portalServer.sendHeader("Cache-Control", "no-store");
	g_portalServer.sendHeader("X-Content-Type-Options", "nosniff");
	g_portalServer.sendHeader("Referrer-Policy", "no-referrer");
	g_portalServer.sendHeader("Content-Security-Policy",
							  "default-src 'none'; style-src 'unsafe-inline'; script-src "
							  "'unsafe-inline'; connect-src 'self'; img-src data:; base-uri "
							  "'none'; form-action 'self'");
	g_portalServer.send(code, "text/html; charset=utf-8", page);
}

void sendPortalJson(const String& json, int code) {
	g_portalServer.sendHeader("Cache-Control", "no-store");
	g_portalServer.sendHeader("X-Content-Type-Options", "nosniff");
	g_portalServer.send(code, "application/json", json);
}

void stopPortalScan() {
	if (g_portalScanState == PortalScanState::Running) esp_wifi_scan_stop();
	WiFi.scanDelete();
	g_portalScanState = PortalScanState::Idle;
	g_portalScanLastError = 0;
}

void startPortalScan(bool userInitiated) {
	if (g_portalScanState == PortalScanState::Running) return;
	if (!g_portalActive) return;
	if (userInitiated) g_portalScanRetried = false;

	// The station must be idle before esp_wifi_scan_start(); a half-open join
	// from the stored-network check otherwise fails with ESP_ERR_WIFI_STATE.
	if (WiFi.status() != WL_CONNECTED) {
		WiFi.setAutoReconnect(false);
		WiFi.disconnect(false, false);
	}
	WiFi.mode(WIFI_AP_STA);
	WiFi.scanDelete();

	g_portalScanLastError = 0;
	g_portalScanStartedMs = millis();
	g_portalScanState = PortalScanState::Running;

	const int16_t result = WiFi.scanNetworks(true, true, false, 300);
	if (result == WIFI_SCAN_RUNNING) return;
	if (result >= 0) {
		// Rare, but the scan can complete before the call returns.
		g_portalScanLastError = 0;
		collectScannedNetworks(result);
		finishPortalScan(result, false);
		return;
	}
	g_portalScanLastError = result;
	finishPortalScan(0, true);
}

void collectScannedNetworks(int found) {
	g_scannedNetworkCount = 0;
	const int limit = found > kMaxScannedNetworks * 2 ? kMaxScannedNetworks * 2 : found;
	for (int index = 0; index < limit; index += 1) {
		const String ssid = WiFi.SSID(index);
		if (ssid.isEmpty() || ssid.length() > fw::kSsidMaxLength) continue;
		const int32_t rssi = WiFi.RSSI(index);
		const bool secure = WiFi.encryptionType(index) != WIFI_AUTH_OPEN;

		int existing = -1;
		for (int scan = 0; scan < g_scannedNetworkCount; scan += 1) {
			if (g_scannedNetworks[scan].ssid == ssid) {
				existing = scan;
				break;
			}
		}
		if (existing >= 0) {
			if (rssi > g_scannedNetworks[existing].rssi) {
				g_scannedNetworks[existing].rssi = rssi;
				g_scannedNetworks[existing].secure = secure;
			}
			continue;
		}
		if (g_scannedNetworkCount >= kMaxScannedNetworks) continue;

		ScannedNetwork entry;
		entry.ssid = ssid;
		entry.rssi = rssi;
		entry.secure = secure;

		int position = g_scannedNetworkCount;
		while (position > 0 && g_scannedNetworks[position - 1].rssi < entry.rssi) {
			g_scannedNetworks[position] = g_scannedNetworks[position - 1];
			position -= 1;
		}
		g_scannedNetworks[position] = entry;
		g_scannedNetworkCount += 1;
	}
	WiFi.scanDelete();
	Serial.printf("[WIFI] scan found %d raw, %d shown\n", found, g_scannedNetworkCount);
}

void finishPortalScan(int count, bool failed) {
	if (!failed && count > 0) {
		g_portalScanState = PortalScanState::Idle;
		return;
	}
	if (!g_portalScanRetried) {
		g_portalScanRetried = true;
		g_portalScanState = PortalScanState::RetryWait;
		g_portalScanRetryAtMs = millis() + kScanRetryDelayMs;
		return;
	}
	g_portalScanState = PortalScanState::Idle;
	Serial.println(failed ? "[WIFI] scan failed twice - manual entry only"
						  : "[WIFI] scan found no networks twice - check the antenna");
}

void servicePortalScan(uint32_t now) {
	if (g_portalScanState == PortalScanState::Running) {
		const int16_t count = WiFi.scanComplete();
		if (count == WIFI_SCAN_RUNNING) {
			if ((now - g_portalScanStartedMs) >= kScanTimeoutMs) {
				Serial.println("[WIFI] scan timed out");
				esp_wifi_scan_stop();
				WiFi.scanDelete();
				g_portalScanLastError = WIFI_SCAN_FAILED;
				finishPortalScan(0, true);
			}
			return;
		}
		if (count >= 0) {
			g_portalScanLastError = 0;
			collectScannedNetworks(count);
			finishPortalScan(count, false);
			return;
		}
		g_portalScanLastError = count;
		WiFi.scanDelete();
		finishPortalScan(0, true);
		return;
	}
	if (g_portalScanState == PortalScanState::RetryWait &&
		static_cast<int32_t>(now - g_portalScanRetryAtMs) >= 0) {
		startPortalScan(false);
	}
}

String portalJoinFailureMessage(const String& detail) {
	if (detail == "no_ssid") {
		return String(F("Network not found. Check the name (2.4 GHz only) and that the router is "
						"switched on."));
	}
	if (detail == "wrong_password") {
		return String(F("The router refused the password. Check it and try again."));
	}
	if (detail == "connection_lost") {
		return String(F("The connection dropped during setup. Move closer to the router and try "
						"again."));
	}
	if (detail == "no_ip") {
		return String(F("The network did not hand out an IP address. Check the router's DHCP "
						"server and try again."));
	}
	if (detail == "invalid_config") {
		return String(F("The radio rejected these Wi-Fi settings. Check the password and try "
						"again."));
	}
	if (detail == "nvs_write") {
		return String(F("The network connected, but the settings could not be saved to flash. "
						"Try again."));
	}
	return String(F("Could not join the network. Check the name and password, then try again."));
}

void failPortalJoin(const char* detail, const char* message) {
	g_portalJoinDetail = detail;
	g_portalJoinMessage = message != nullptr ? message : portalJoinFailureMessage(detail);
	g_portalJoinState = PortalJoinState::Failed;
	g_homeWifiState = fw::DisplayWifiState::Setup;
	g_portalPendingPass = "";
	// Keep a first-time token in RAM so a retry does not force it to be retyped,
	// but never let it shadow an already-stored token: a blank field then means
	// exactly what the form says (keep the saved token).
	if (fw::isValidStoredToken(g_deviceToken.c_str())) g_portalPendingToken = "";
	g_portalStopAtMs = 0;
	WiFi.disconnect(false, false);
	WiFi.setAutoReconnect(false);
	// Deliberately no token/password in this line.
	Serial.printf("[WIFI] join failed (%s) - credentials not saved\n", detail);
}

bool savePortalProvisioning() {
	bool ok = true;
	ok = prefs.putString("wifi_ssid", g_portalPendingSsid) > 0 && ok;
	ok = prefs.putString("wifi_pass", g_portalPendingPass) > 0 && ok;
	ok = prefs.putString("device_id", g_portalPendingDeviceId) > 0 && ok;
	ok = prefs.putString("device_token", g_portalPendingToken) > 0 && ok;
	if (ok) ok = prefs.putBool("provisioned", true) > 0;
	return ok;
}

void succeedPortalJoin() {
	if (!savePortalProvisioning()) {
		prefs.putBool("provisioned", false);
		failPortalJoin("nvs_write", "The network connected, but the settings could not be saved "
									"to flash. Try again.");
		return;
	}
	g_deviceId = g_portalPendingDeviceId;
	g_deviceToken = g_portalPendingToken;
	g_provisioned = true;
	g_portalJoinState = PortalJoinState::Connected;
	g_portalStopAtMs = millis() + kPortalCloseDelayMs;
	g_portalPendingPass = "";
	g_portalPendingToken = "";

	// The success screen outlives the portal's 2 s close delay by a second, so
	// the operator sees the SSID and IP for about 3 s even after the radio is
	// switched off. The home screen then reports "WiFi: joined", which means
	// joined to the network, not online.
	const IPAddress ip = WiFi.localIP();
	fw::formatIpv4(ip[0], ip[1], ip[2], ip[3], g_wifiOkIp, sizeof(g_wifiOkIp));
	g_wifiOkSsid = g_portalPendingSsid;
	g_wifiOkUntilMs = millis() + fw::kDisplayWifiOkHoldMs;
	g_homeWifiState = fw::DisplayWifiState::Joined;

	Serial.printf("[WIFI] joined \"%s\" at %s - provisioning saved; closing portal\n",
				  g_portalPendingSsid.c_str(), ip.toString().c_str());
}

void startPortalJoin(const String& ssid, const String& pass, const String& deviceId,
					 const String& token) {
	g_portalPendingSsid = ssid;
	g_portalPendingPass = pass;
	g_portalPendingDeviceId = deviceId;
	g_portalPendingToken = token;
	g_portalJoinDetail = "";
	g_portalJoinMessage = "";
	g_portalFormError = "";
	g_portalStopAtMs = 0;

	stopPortalScan();
	WiFi.mode(WIFI_AP_STA);
	WiFi.setAutoReconnect(false);
	WiFi.disconnect(false, false);
	g_portalJoinState = PortalJoinState::Testing;
	g_portalJoinStartedMs = millis();

	const wl_status_t result = WiFi.begin(ssid.c_str(), pass.c_str());
	// The SSID is broadcast; the password is never logged.
	Serial.printf("[WIFI] testing \"%s\" before saving (begin rc=%d)\n", ssid.c_str(),
				  static_cast<int>(result));
	if (result == WL_CONNECT_FAILED) {
		failPortalJoin("invalid_config", nullptr);
	}
}

void servicePortalJoin(uint32_t now) {
	if (g_portalJoinState == PortalJoinState::Connected) {
		if (g_portalStopAtMs != 0 && static_cast<int32_t>(now - g_portalStopAtMs) >= 0) {
			stopProvisioningPortal("provisioned");
		}
		return;
	}
	if (g_portalJoinState != PortalJoinState::Testing) return;

	if (WiFi.status() == WL_CONNECTED) {
		const IPAddress ip = WiFi.localIP();
		if (ip[0] != 0 || ip[1] != 0 || ip[2] != 0 || ip[3] != 0) {
			succeedPortalJoin();
			return;
		}
	}

	const uint32_t elapsed = now - g_portalJoinStartedMs;
	const wl_status_t status = WiFi.status();
	const bool definitive =
		status == WL_NO_SSID_AVAIL || status == WL_CONNECT_FAILED || status == WL_CONNECTION_LOST;
	if (definitive && elapsed >= fw::kJoinQuickFailMs) {
		if (status == WL_NO_SSID_AVAIL) {
			failPortalJoin("no_ssid", nullptr);
		} else if (status == WL_CONNECT_FAILED) {
			failPortalJoin("wrong_password", nullptr);
		} else {
			failPortalJoin("connection_lost", nullptr);
		}
		return;
	}
	if (elapsed >= fw::kJoinTimeoutMs) {
		if (status == WL_NO_SSID_AVAIL) {
			failPortalJoin("no_ssid", nullptr);
		} else if (status == WL_CONNECT_FAILED) {
			failPortalJoin("wrong_password", nullptr);
		} else if (status == WL_CONNECTION_LOST) {
			failPortalJoin("connection_lost", nullptr);
		} else {
			failPortalJoin("no_ip", nullptr);
		}
	}
}

void stopProvisioningPortal(const char* reason) {
	if (!g_portalActive) return;
	stopPortalScan();
	g_portalDns.stop();
	g_portalServer.stop();
	WiFi.softAPdisconnect(true);
	WiFi.disconnect(false, false);
	WiFi.setAutoReconnect(true);
	WiFi.mode(WIFI_OFF);

	g_portalActive = false;
	g_portalStopAtMs = 0;
	g_portalApName = "";
	g_portalJoinState = PortalJoinState::Idle;
	g_portalPendingSsid = "";
	g_portalPendingPass = "";
	g_portalPendingDeviceId = "";
	g_portalPendingToken = "";
	g_portalJoinDetail = "";
	g_portalJoinMessage = "";
	g_portalFormError = "";
	Serial.printf("[WIFI] setup portal stopped (%s)\n", reason);
}

void handlePortalRoot() {
	if (g_portalJoinState == PortalJoinState::Testing ||
		g_portalJoinState == PortalJoinState::Connected) {
		sendPortalHtml(200, buildPortalStatusPage());
		return;
	}
	String ssid = g_portalPendingSsid;
	if (ssid.isEmpty()) ssid = prefs.getString("wifi_ssid", "");
	String error = g_portalFormError;
	if (error.isEmpty() && g_portalJoinState == PortalJoinState::Failed) {
		error = g_portalJoinMessage;
	}
	sendPortalHtml(200, buildPortalPage(ssid, error));
}

void handlePortalSave() {
	if (g_portalJoinState == PortalJoinState::Testing ||
		g_portalJoinState == PortalJoinState::Connected) {
		g_portalServer.sendHeader("Location", "/", true);
		g_portalServer.sendHeader("Cache-Control", "no-store");
		g_portalServer.send(303, "text/plain", "");
		return;
	}

	const String ssid = g_portalServer.arg("ssid");
	const String pass = g_portalServer.arg("pass");
	String deviceId = g_portalServer.arg("device_id");
	String token = g_portalServer.arg("device_token");
	deviceId.trim();
	token.trim();

	if (deviceId.isEmpty()) deviceId = portalDeviceIdForDisplay();
	if (token.isEmpty()) {
		if (fw::isValidStoredToken(g_portalPendingToken.c_str())) {
			token = g_portalPendingToken;
		} else if (fw::isValidStoredToken(g_deviceToken.c_str())) {
			token = g_deviceToken;
		}
	}

	const fw::ProvisioningField field =
		fw::validateProvisioningForm(ssid.c_str(), pass.c_str(), deviceId.c_str(), token.c_str());
	if (field != fw::ProvisioningField::None) {
		g_portalFormError = fw::provisioningFieldMessage(field);
		if (field == fw::ProvisioningField::Token && token.isEmpty()) {
			g_portalFormError = "Device Token is required for first-time setup.";
		}
		// Keep the submitted SSID visible after a refresh. The password and
		// token are deliberately not retained in the form.
		g_portalPendingSsid = ssid;
		sendPortalHtml(400, buildPortalPage(ssid, g_portalFormError));
		return;
	}

	startPortalJoin(ssid, pass, deviceId, token);
	g_portalServer.sendHeader("Location", "/", true);
	g_portalServer.sendHeader("Cache-Control", "no-store");
	g_portalServer.send(303, "text/plain", "");
}

void handlePortalStatus() {
	JsonDocument doc;
	const char* state = "idle";
	if (g_portalJoinState == PortalJoinState::Testing) {
		state = "testing";
	} else if (g_portalJoinState == PortalJoinState::Connected) {
		state = "connected";
	} else if (g_portalJoinState == PortalJoinState::Failed) {
		state = "failed";
	}
	doc["state"] = state;
	doc["ssid"] = g_portalPendingSsid;
	if (g_portalJoinState == PortalJoinState::Connected) {
		doc["ip"] = WiFi.localIP().toString();
		doc["rssi"] = WiFi.RSSI();
	}
	if (g_portalJoinState == PortalJoinState::Failed) {
		doc["detail"] = g_portalJoinDetail;
		doc["message"] = g_portalJoinMessage;
	}
	String out;
	serializeJson(doc, out);
	sendPortalJson(out, 200);
}

void handlePortalScanGet() {
	JsonDocument doc;
	doc["scanning"] = portalScanInProgress();
	doc["error"] = g_portalScanLastError;
	JsonArray networks = doc["networks"].to<JsonArray>();
	for (int index = 0; index < g_scannedNetworkCount; index += 1) {
		JsonObject network = networks.add<JsonObject>();
		network["ssid"] = g_scannedNetworks[index].ssid;
		network["rssi"] = g_scannedNetworks[index].rssi;
		network["secure"] = g_scannedNetworks[index].secure;
	}
	String out;
	serializeJson(doc, out);
	sendPortalJson(out, 200);
}

void handlePortalScanPost() {
	if (g_portalJoinState == PortalJoinState::Testing ||
		g_portalJoinState == PortalJoinState::Connected) {
		sendPortalJson(F("{\"ok\":false,\"error\":\"busy\"}"), 409);
		return;
	}
	if (!portalScanInProgress()) startPortalScan(true);
	sendPortalJson(portalScanInProgress() ? F("{\"ok\":true,\"scanning\":true}")
										  : F("{\"ok\":true,\"scanning\":false}"),
				   200);
}

void handlePortalNotFound() {
	String target = String(F("http://")) + WiFi.softAPIP().toString() + "/";
	g_portalServer.sendHeader("Location", target, true);
	g_portalServer.sendHeader("Cache-Control", "no-store");
	g_portalServer.send(302, "text/plain", "");
}

void startProvisioningPortal() {
	if (g_portalActive) return;

	g_homeWifiState = fw::DisplayWifiState::Setup;
	g_storedWifiCheckActive = false;
	g_storedWifiState = StoredWifiState::Done;

	char name[fw::kProvisioningApNameMax];
	const String mac = chipMac();
	if (!fw::provisioningApName(mac.c_str(), name, sizeof(name))) {
		Serial.println("[WIFI] could not derive the setup AP name");
		return;
	}
	g_portalApName = name;

	WiFi.setAutoReconnect(false);
	if (WiFi.status() != WL_CONNECTED) WiFi.disconnect(false, false);
	WiFi.mode(WIFI_AP_STA);

	// The documented portal address. The core defaults to this subnet, but pin
	// it explicitly so a future core change cannot move the page.
	const IPAddress apIp(192, 168, 4, 1);
	WiFi.softAPConfig(apIp, apIp, IPAddress(255, 255, 255, 0));

	if (!WiFi.softAP(g_portalApName.c_str())) {
		Serial.println("[WIFI] could not start the setup access point");
		WiFi.mode(WIFI_OFF);
		g_portalApName = "";
		return;
	}

	g_portalDns.setErrorReplyCode(DNSReplyCode::NoError);
	g_portalDns.start(53, "*", WiFi.softAPIP());

	if (!g_portalRoutesRegistered) {
		g_portalServer.on("/", HTTP_GET, handlePortalRoot);
		g_portalServer.on("/save", HTTP_POST, handlePortalSave);
		g_portalServer.on("/status", HTTP_GET, handlePortalStatus);
		g_portalServer.on("/scan", HTTP_GET, handlePortalScanGet);
		g_portalServer.on("/scan", HTTP_POST, handlePortalScanPost);
		g_portalServer.onNotFound(handlePortalNotFound);
		g_portalRoutesRegistered = true;
	}
	g_portalServer.begin();

	g_portalActive = true;
	g_portalStartedMs = millis();
	g_portalStopAtMs = 0;
	g_portalJoinState = PortalJoinState::Idle;
	g_portalPendingSsid = "";
	g_portalPendingPass = "";
	g_portalPendingDeviceId = "";
	g_portalPendingToken = "";
	g_portalJoinDetail = "";
	g_portalJoinMessage = "";
	g_portalFormError = "";

	Serial.printf("[WIFI] setup portal \"%s\" at http://%s\n", g_portalApName.c_str(),
				  WiFi.softAPIP().toString().c_str());
	startPortalScan(true);
}

void startStoredWifiAttempt(uint32_t now) {
	const String ssid = prefs.getString("wifi_ssid", "");
	const String pass = prefs.getString("wifi_pass", "");
	g_activeWifiSsid = ssid;
	g_homeWifiState = fw::DisplayWifiState::Joining;
	g_storedWifiAttempts += 1;
	g_storedWifiStartedMs = now;
	g_storedWifiState = StoredWifiState::Joining;

	WiFi.mode(WIFI_STA);
	WiFi.setAutoReconnect(false);
	WiFi.disconnect(false, false);
	WiFi.begin(ssid.c_str(), pass.c_str());
	Serial.printf("[WIFI] checking stored network \"%s\" (%u/%u)\n", ssid.c_str(),
				  static_cast<unsigned>(g_storedWifiAttempts),
				  static_cast<unsigned>(fw::kMaxJoinFailures));
}

void serviceStoredWifiCheck(uint32_t now) {
	if (!g_storedWifiCheckActive) return;

	if (g_storedWifiState == StoredWifiState::Joining) {
		const IPAddress ip = WiFi.localIP();
		const bool hasIp = ip[0] != 0 || ip[1] != 0 || ip[2] != 0 || ip[3] != 0;
		if (WiFi.status() == WL_CONNECTED && hasIp) {
			Serial.printf("[WIFI] stored network reachable at %s; radio off\n",
						  ip.toString().c_str());
			g_homeWifiState = fw::DisplayWifiState::Joined;
			WiFi.disconnect(false, false);
			WiFi.setAutoReconnect(false);
			WiFi.mode(WIFI_OFF);
			g_storedWifiState = StoredWifiState::Done;
			g_storedWifiCheckActive = false;
			return;
		}

		const uint32_t elapsed = now - g_storedWifiStartedMs;
		const wl_status_t status = WiFi.status();
		const bool definitive = status == WL_NO_SSID_AVAIL || status == WL_CONNECT_FAILED ||
								status == WL_CONNECTION_LOST;
		if (!(definitive && elapsed >= fw::kJoinQuickFailMs) && elapsed < fw::kJoinTimeoutMs) {
			return;
		}

		Serial.printf("[WIFI] stored join attempt %u failed (status %d)\n",
					  static_cast<unsigned>(g_storedWifiAttempts), static_cast<int>(status));
		WiFi.disconnect(false, false);
		WiFi.setAutoReconnect(false);
		if (g_storedWifiAttempts >= fw::kMaxJoinFailures) {
			g_storedWifiCheckActive = false;
			g_storedWifiState = StoredWifiState::Done;
			Serial.println("[WIFI] three failed joins - opening the setup portal");
			startProvisioningPortal();
			return;
		}
		g_storedWifiState = StoredWifiState::RetryWait;
		g_storedWifiRetryAtMs = now + kStoredWifiRetryGapMs;
		return;
	}

	if (g_storedWifiState == StoredWifiState::RetryWait &&
		static_cast<int32_t>(now - g_storedWifiRetryAtMs) >= 0) {
		startStoredWifiAttempt(now);
	}
}

void serviceWifiCommissioning(uint32_t now) {
	if (g_portalActive) {
		g_portalDns.processNextRequest();
		g_portalServer.handleClient();
		// A handled request can start a join or a scan. Re-read the clock so
		// their elapsed-time checks do not see the pre-request timestamp (which
		// would underflow a uint32_t subtraction and look like a timeout).
		now = millis();
		servicePortalScan(now);
		servicePortalJoin(now);
		if (!g_portalActive) return;
		if (g_portalStopAtMs != 0 && static_cast<int32_t>(now - g_portalStopAtMs) >= 0) {
			stopProvisioningPortal("provisioned");
			return;
		}
		if ((now - g_portalStartedMs) >= fw::kPortalMaxLifetimeMs) {
			// No verified save in the window: the home screen must say "setup",
			// not "connected", even if a stored network exists.
			g_homeWifiState = fw::DisplayWifiState::Setup;
			stopProvisioningPortal("lifetime elapsed");
			return;
		}
		return;
	}
	serviceStoredWifiCheck(now);
}

void setupWifiCommissioning() {
	const String ssid = prefs.getString("wifi_ssid", "");
	const String pass = prefs.getString("wifi_pass", "");
	g_provisioned = prefs.getBool("provisioned", false);
	if (!fw::isProvisioningComplete(g_provisioned, ssid.c_str(), pass.c_str(), g_deviceId.c_str(),
									g_deviceToken.c_str())) {
		Serial.println("[WIFI] unit is not provisioned - opening the setup portal");
		startProvisioningPortal();
		return;
	}
	Serial.println("[WIFI] provisioned - checking the stored network");
	g_storedWifiCheckActive = true;
	g_storedWifiAttempts = 0;
	g_storedWifiState = StoredWifiState::Idle;
	startStoredWifiAttempt(millis());
}

// ---------------------------------------------------------------------------
// Status display (SSD1306 at 0x3C on the shared 21/22 bus)
// ---------------------------------------------------------------------------
//
// The panel is optional and is not part of the safety path. It shows the
// commissioning state and a home summary; it never shows the device token and
// never claims the unit is "online", because WiFi is commissioning-only and
// telemetry stays on the A7670E.
//
// The update is bounded: the driver redraws only when the text changed, at
// most once per kDisplayMinDrawGapMs, and this function returns before any I2C
// traffic while the alert state machine is not Idle. No delays here.

void serviceDisplay(uint32_t now) {
	if (!g_display.present()) return;
	if (g_safety.state() != fw::AlertState::Idle) return;

	if (g_wifiOkUntilMs != 0) {
		if (static_cast<int32_t>(now - g_wifiOkUntilMs) < 0) {
			g_display.show(fw::wifiOkScreen(g_wifiOkSsid.c_str(), g_wifiOkIp), now);
			return;
		}
		g_wifiOkUntilMs = 0;
	}

	if (g_portalActive) {
		if (g_portalJoinState == PortalJoinState::Testing) {
			g_display.show(fw::joiningScreen(g_portalPendingSsid.c_str(),
											 now / fw::kDisplayProgressStepMs, 0, 0),
						   now);
		} else {
			g_display.show(fw::provisioningScreen(g_portalApName.c_str()), now);
		}
		return;
	}

	if (g_storedWifiCheckActive && g_storedWifiState == StoredWifiState::Joining) {
		g_display.show(fw::joiningScreen(g_activeWifiSsid.c_str(), now / fw::kDisplayProgressStepMs,
										 g_storedWifiAttempts, fw::kMaxJoinFailures),
					   now);
		return;
	}

	g_display.show(fw::homeScreen(g_homeWifiState, g_deviceId.c_str(), g_deviceUuid.c_str(),
								  bestEpochSeconds()),
				   now);
}

void clearStoredWifiCredentials() {
	prefs.remove("wifi_ssid");
	prefs.remove("wifi_pass");
}

void clearStoredIdentity() {
	prefs.remove("device_id");
	prefs.remove("device_token");
	prefs.remove("device_uuid");
	prefs.remove("provisioned");
	g_deviceId = chipMac();
	g_deviceToken = "";
	g_deviceUuid = "";
	g_provisioned = false;
}

void serviceBootReset(uint32_t now, bool alertActive) {
	if (!g_bootReset.active() && !g_bootReset.restartPending() && !g_factoryReset.active() &&
		!g_factoryReset.restartPending()) {
		return;
	}
	if (alertActive) {
		// A pending restart must not interrupt an alert. The NVS clear (if it
		// already happened) stays; the portal reopens on the next boot.
		g_bootReset.abort();
		g_factoryReset.abort();
		Serial.println("[RESET] boot reset cancelled: alert is active");
		return;
	}

	const bool wifiPressed = digitalRead(hw::kWifiResetButton) == LOW;
	const bool factoryPressed = digitalRead(hw::kFactoryResetButton) == LOW;

	// Factory wins if both are held: it is the destructive gesture.
	const fw::BootResetAction factoryAction = g_factoryReset.update(now, factoryPressed);
	if (factoryAction == fw::BootResetAction::ClearAll) {
		clearStoredWifiCredentials();
		clearStoredIdentity();
		Serial.println("[RESET] WiFi, identity and provisioning cleared");
	} else {
		const fw::BootResetAction wifiAction = g_bootReset.update(now, wifiPressed);
		if (wifiAction == fw::BootResetAction::ClearWifi) {
			clearStoredWifiCredentials();
			Serial.println("[RESET] WiFi cleared, identity kept; release to restart");
		} else if (wifiAction == fw::BootResetAction::ClearAll) {
			clearStoredWifiCredentials();
			clearStoredIdentity();
			Serial.println("[RESET] WiFi, identity and provisioning cleared");
		}
	}

	// Do not restart the WiFi gesture while the factory button is still held;
	// that would interrupt the 10 s factory hold.
	const bool factoryDone = g_factoryReset.restartPending();
	const bool wifiDone = g_bootReset.restartPending() && !factoryPressed;
	if (factoryDone || wifiDone) {
		Serial.println("[RESET] restarting");
		delay(150);
		ESP.restart();
	}
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

String heartbeatPayload(float accelG, float tiltDeg, bool vibration, float speedKph, float batteryV,
						bool ignition) {
	const fw::GpsFix fix = {
		gps.location.isValid(),
		gps.location.lat(),
		gps.location.lng(),
		gps.location.isValid() ? gps.location.age() : 0,
		static_cast<uint8_t>(gps.satellites.value()),
		static_cast<float>(gps.hdop.hdop()),
	};

	JsonDocument doc;
	doc["device_id"] = g_deviceId;
	doc["firmware_version"] = FW_VERSION;
	JsonObject heartbeat = doc["heartbeat"].to<JsonObject>();
	if (hw::kHasPowerSense) {
		heartbeat["battery_v"] = batteryV;
		heartbeat["ignition"] = ignition;
	}
	heartbeat["rssi_dbm"] = modemSignalDbm();
	heartbeat["satellites"] = fix.satellites;
	heartbeat["hdop"] = fix.hdop;
	if (fw::isValidCoordinate(fix.lat, fix.lng)) {
		heartbeat["lat"] = fix.lat;
		heartbeat["lng"] = fix.lng;
		heartbeat["gps_fix_age_s"] = fix.ageMs / 1000UL;
	}
	heartbeat["accel_g"] = accelG;
	heartbeat["tilt_deg"] = tiltDeg;
	heartbeat["vibration"] = vibration;
	heartbeat["config_rev"] = g_configRev;

	JsonArray samples = doc["samples"].to<JsonArray>();
	const uint32_t now = gpsEpochSeconds();
	if (now > 0) {
		JsonObject sample = samples.add<JsonObject>();
		sample["id"] = String("hb-") + String(millis());
		sample["t"] = now;
		sample["accel_g"] = accelG;
		sample["tilt_deg"] = tiltDeg;
		sample["vibration"] = vibration;
		sample["speed_kph"] = speedKph;
		sample["satellites"] = fix.satellites;
		sample["hdop"] = fix.hdop;
		if (hw::kHasPowerSense) {
			sample["battery_v"] = batteryV;
			sample["ignition"] = ignition;
		}
	}

	String body;
	serializeJson(doc, body);
	return body;
}

bool sendIncident(const char* status, bool cancelled) {
	if (g_incidentId.isEmpty()) return false;

	const fw::GpsFix fix = {
		gps.location.isValid(),
		gps.location.lat(),
		gps.location.lng(),
		gps.location.isValid() ? gps.location.age() : 0,
		static_cast<uint8_t>(gps.satellites.value()),
		static_cast<float>(gps.hdop.hdop()),
	};

	JsonDocument doc;
	doc["device_id"] = g_deviceId;
	doc["incident_id"] = g_incidentId;
	doc["detected_at"] = g_detectedAt;
	// Only a dispatched incident has a send time, and only when the GPS clock
	// was set. A suspected report before the countdown omits the field.
	if (g_sentAt > 0) doc["sent_at"] = g_sentAt;
	doc["peak_accel_g"] = g_peakAccel;
	doc["tilt_deg"] = g_peakTilt;
	doc["vibration_count"] = g_vibrationCount;
	doc["speed_kph"] = gps.speed.isValid() ? gps.speed.kmph() : 0;
	if (fw::isValidCoordinate(fix.lat, fix.lng)) {
		doc["lat"] = fix.lat;
		doc["lng"] = fix.lng;
		doc["gps_age_s"] = fix.ageMs / 1000UL;
	}
	doc["status"] = status;
	doc["cancelled"] = cancelled;

	JsonObject evidence = doc["evidence"].to<JsonObject>();
	JsonArray samples = evidence["samples"].to<JsonArray>();
	for (int index = 0; index < g_sampleCount; index += 1) {
		JsonObject sample = samples.add<JsonObject>();
		sample["t"] = g_samples[index].t;
		sample["accel_g"] = g_samples[index].accelG;
		sample["tilt_deg"] = g_samples[index].tiltDeg;
	}

	String body;
	serializeJson(doc, body);
	return modemHttpRequest("POST", "/api/device/incident", body, nullptr);
}

bool sendCancel() {
	if (g_incidentId.isEmpty()) return false;
	JsonDocument doc;
	doc["device_id"] = g_deviceId;
	doc["incident_id"] = g_incidentId;
	doc["cancelled_at"] = gpsEpochSeconds();
	String body;
	serializeJson(doc, body);
	return modemHttpRequest("POST", "/api/device/incident/cancel", body, nullptr);
}

void sendSmsAlerts() {
	const fw::GpsFix fix = {
		gps.location.isValid(),
		gps.location.lat(),
		gps.location.lng(),
		gps.location.isValid() ? gps.location.age() : 0,
		static_cast<uint8_t>(gps.satellites.value()),
		static_cast<float>(gps.hdop.hdop()),
	};

	char bodyBuffer[fw::kSmsMaxBytes];
	const String callback = prefs.getString("alert_phone_1", "");
	fw::buildSosSms(bodyBuffer, sizeof(bodyBuffer), prefs.getString("plate_no", "vehicle").c_str(),
					fix, gps.speed.isValid() ? gps.speed.kmph() : 0, callback.c_str());

	const String phone1 = prefs.getString("alert_phone_1", "");
	const String phone2 = prefs.getString("alert_phone_2", "");
	bool sent = false;
	if (!phone1.isEmpty()) sent = sendSms(phone1, String(bodyBuffer)) || sent;

	// A remote cancel can only be observed between blocking AT calls. If the
	// operator cancelled while the first message was in flight, do not send the
	// second one.
	if (g_safety.state() != fw::AlertState::Alerting) {
		Serial.println("[SOS] cancel observed; second recipient suppressed");
		return;
	}

	if (!phone2.isEmpty()) sent = sendSms(phone2, String(bodyBuffer)) || sent;
	Serial.println(sent ? "[SOS] SMS sent" : "[SOS] SMS failed or no phone configured");
}

/**
 * All-clear for a cancelled incident. The device owns the modem and the
 * recipient numbers, so the platform does not need an SMS provider. If the
 * device is offline this cannot be delivered; the incident record still shows
 * the false alarm.
 */
void sendAllClearSms() {
	const String plate = prefs.getString("plate_no", "vehicle");
	const String body = "LIFELINK ALL CLEAR " + plate +
						" - false alarm. The earlier SOS was cancelled. No emergency.";
	const String phone1 = prefs.getString("alert_phone_1", "");
	const String phone2 = prefs.getString("alert_phone_2", "");
	if (!phone1.isEmpty()) sendSms(phone1, body);
	if (!phone2.isEmpty()) sendSms(phone2, body);
	Serial.println("[SOS] all-clear sent");
}

void sendCommandAck(const String& commandId, const char* status, const char* detail) {
	JsonDocument doc;
	doc["device_id"] = g_deviceId;
	doc["command_id"] = commandId;
	doc["status"] = status;
	if (detail != nullptr && detail[0] != '\0') doc["detail"] = detail;
	String body;
	serializeJson(doc, body);
	modemHttpRequest("POST", "/api/device/command/ack", body, nullptr);
}

void handleCommands(JsonArray commands) {
	for (JsonObject command : commands) {
		// The previous command's acknowledgement is a bounded modem request;
		// reaching this line proves it returned. A hung handler never feeds.
		feedWatchdog();
		const String id = command["id"] | "";
		const String kind = command["kind"] | "";
		if (id.isEmpty()) continue;

		Serial.print("[CMD] ");
		Serial.println(kind);

		if (kind == "LOCATE") {
			const String body = heartbeatPayload(0, 0, false, 0, 0, false);
			modemHttpRequest("POST", "/api/device/ingest", body, nullptr);
			// The acknowledgement below is a second request in this command.
			feedWatchdog();
		} else if (kind == "TEST_ALERT") {
			g_buzzer.setPattern(fw::BuzzerPattern::Alerting, millis());
			g_testAlertUntil = millis() + 3000;
		} else if (kind == "ARM" || kind == "DISARM") {
			// Crash detection is always on, so these commands are answered but
			// deliberately change no state. The ACK tells the console the command
			// was received and not applied.
			Serial.println("[CMD] arm/disarm unsupported; detection stays on");
			sendCommandAck(id, "ACKED", "unsupported");
			continue;
		} else if (kind == "SET_CONFIG") {
			// The config object is applied from the same poll response.
		} else if (kind == "CANCEL_ALERT") {
			const String incidentId = command["payload"]["incident_id"] | "";
			const bool allClear = command["payload"]["all_clear"] | false;

			if (!incidentId.isEmpty() && !g_incidentId.isEmpty() && incidentId != g_incidentId) {
				Serial.println("[CMD] CANCEL_ALERT for a different incident");
				sendCommandAck(id, "ACKED", "unknown_incident");
				continue;
			}

			if (g_safety.cancelFromRemote()) {
				Serial.println("[CMD] CANCEL_ALERT accepted");
				if (allClear) g_allClearPending = true;
				sendCommandAck(id, "ACKED", "cancelled");
			} else {
				Serial.println("[CMD] CANCEL_ALERT too late");
				sendCommandAck(id, "ACKED", "too_late");
			}
			continue;
		} else if (kind == "ACK_INCIDENT") {
			// The portal acknowledges the dispatch alarm with the device client
			// incident id (llk-...), not the server ImpactEvent id. A different
			// or missing id changes nothing: the alarm keeps running.
			const String incidentId = command["payload"]["incident_id"] | "";
			const fw::IncidentAck result =
				g_safety.acknowledgeIncident(incidentId.c_str(), g_incidentId.c_str());
			if (result == fw::IncidentAck::Acknowledged) {
				Serial.println("[CMD] ACK_INCIDENT accepted");
				g_buzzer.setPattern(fw::BuzzerPattern::Off, millis());
				g_incidentId = "";
				g_lastState = fw::AlertState::Idle;
				sendCommandAck(id, "ACKED", "acknowledged");
			} else {
				Serial.println("[CMD] ACK_INCIDENT for an unknown incident");
				sendCommandAck(id, "ACKED", "unknown_incident");
			}
			continue;
		}
		sendCommandAck(id, "ACKED", nullptr);
	}
}

void pollCommands() {
	if (g_deviceToken.isEmpty()) return;
	String response;
	const String path = String("/api/device/command?device_id=") + g_deviceId;
	if (!modemHttpRequest("GET", path.c_str(), "", &response)) return;

	JsonDocument doc;
	if (deserializeJson(doc, response) != DeserializationError::Ok) return;
	JsonObject data = doc["data"].as<JsonObject>();
	if (data.isNull()) return;

	if (!data["config"].isNull()) {
		JsonObject config = data["config"].as<JsonObject>();
		if (queueConfigObject(config)) {
			Serial.printf("[CFG] queued from server rev=%lu\n",
						  static_cast<unsigned long>(g_pendingRev));
		}
	}

	JsonArray phones = data["alert_phones"].as<JsonArray>();
	if (!phones.isNull() && phones.size() > 0) {
		prefs.putString("alert_phone_1", phones[0].as<String>());
	}
	if (!phones.isNull() && phones.size() > 1) {
		prefs.putString("alert_phone_2", phones[1].as<String>());
	}

	JsonArray commands = data["commands"].as<JsonArray>();
	if (!commands.isNull()) handleCommands(commands);
}

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

void readGps() {
	while (gpsSerial.available()) gps.encode(static_cast<char>(gpsSerial.read()));
}

float readBatteryVoltage() {
	if (!hw::kHasPowerSense) return 0.0f;
	const uint16_t raw = analogRead(hw::kBatteryAdc);
	// 12 V -> 2.4 V after a 5:1 divider; calibrate the ratio against a meter.
	return fw::adcToVoltage(raw, 5.0f);
}

bool readIgnition() {
	if (!hw::kHasPowerSense) return false;
	return analogRead(hw::kIgnitionAdc) > 1800;
}

#ifdef LIFELINK_BENCH_WDT
/**
 * Bench-only proof for the watchdog. The loop task blocks without resetting
 * the watchdog, so
 * the task watchdog must panic and reboot the board. It is compiled only in
 * env:esp32dev-bench and the caller refuses it unless the tracker is Idle.
 *
 * The window is 60 s longer than the timeout. If this function returns, the
 * watchdog did not fire and the build or configuration must be investigated.
 */
void runWatchdogBenchTest() {
	const uint32_t windowMs = (kWatchdogTimeoutS + 60UL) * 1000UL;
	const uint32_t deadlineMs = millis() + windowMs;
	Serial.printf("[TEST] TEST_WDT: no feed for %lu s; expect a panic and a reboot\n",
				  static_cast<unsigned long>(windowMs / 1000UL));
	Serial.flush();
	while (static_cast<int32_t>(deadlineMs - millis()) > 0) {
		delay(100);
	}
	Serial.println("[TEST] TEST_WDT: no reset observed; check the watchdog configuration");
}
#endif

void handleSerialProvisioning() {
	static String line;
	while (Serial.available()) {
		const char c = static_cast<char>(Serial.read());
		if (c == '\n') {
			line.trim();
			if (line.startsWith("SET_ID ")) {
				g_deviceId = line.substring(7);
				prefs.putString("device_id", g_deviceId);
				Serial.println("[SETUP] device id saved");
			} else if (line.startsWith("SET_TOKEN ")) {
				g_deviceToken = line.substring(10);
				prefs.putString("device_token", g_deviceToken);
				Serial.println("[SETUP] token saved");
			} else if (line.startsWith("SET_PHONE1 ")) {
				prefs.putString("alert_phone_1", line.substring(11));
				Serial.println("[SETUP] phone 1 saved");
			} else if (line.startsWith("SET_PHONE2 ")) {
				prefs.putString("alert_phone_2", line.substring(11));
				Serial.println("[SETUP] phone 2 saved");
			} else if (line.startsWith("SET_PLATE ")) {
				prefs.putString("plate_no", line.substring(10));
				Serial.println("[SETUP] plate saved");
			} else if (line == "STATUS") {
				Serial.printf("[STATUS] id=%s token=%s cfg_rev=%lu state=%d\n", g_deviceId.c_str(),
							  g_deviceToken.isEmpty() ? "missing" : "set",
							  static_cast<unsigned long>(g_configRev),
							  static_cast<int>(g_safety.state()));
			} else if (line == "TIME") {
				const uint32_t rtcEpoch = g_rtc.nowEpoch();
				const uint32_t gpsEpoch = gpsEpochSeconds();
				char rtcClock[fw::kClockHmsTextMax] = "--:--:--";
				char gpsClock[fw::kClockHmsTextMax] = "--:--:--";
				if (!fw::formatClockHms(rtcEpoch, rtcClock, sizeof(rtcClock))) {
					snprintf(rtcClock, sizeof(rtcClock), "--:--:--");
				}
				if (!fw::formatClockHms(gpsEpoch, gpsClock, sizeof(gpsClock))) {
					snprintf(gpsClock, sizeof(gpsClock), "--:--:--");
				}
				const char* source = rtcEpoch > 0 ? "rtc" : (gpsEpoch > 0 ? "gps" : "none");
				Serial.printf("[TIME] rtc=%lu (%s) gps=%lu (%s) source=%s present=%s "
							  "lost_power=%s\n",
							  static_cast<unsigned long>(rtcEpoch), rtcClock,
							  static_cast<unsigned long>(gpsEpoch), gpsClock, source,
							  g_rtc.present() ? "yes" : "no", g_rtc.lostPower() ? "yes" : "no");
			} else if (line.startsWith("SET_TIME ")) {
				const String value = line.substring(9);
				char* end = nullptr;
				const unsigned long parsed = strtoul(value.c_str(), &end, 10);
				if (end == value.c_str() || *end != '\0' ||
					!fw::isPlausibleEpoch(static_cast<uint32_t>(parsed))) {
					Serial.println("[TIME] SET_TIME rejected: expected a Unix epoch for 2024-2099");
				} else if (!g_rtc.setEpoch(static_cast<uint32_t>(parsed))) {
					Serial.println("[TIME] SET_TIME failed: no DS3231 at 0x68");
				} else {
					char clock[fw::kClockHmsTextMax];
					if (!fw::formatClockHms(static_cast<uint32_t>(parsed), clock, sizeof(clock))) {
						snprintf(clock, sizeof(clock), "--:--:--");
					}
					Serial.printf("[TIME] DS3231 set to %s UTC\n", clock);
				}
			} else if (line == "CONFIG") {
				JsonDocument doc;
				JsonObject object = doc.to<JsonObject>();
				object["version"] = fw::kConfigContractVersion;
				object["rev"] = g_configRev;
#define FW_DUMP(name, key, min, max, integer, def) object[key] = g_config.name;
				FW_CONFIG_FIELDS(FW_DUMP)
#undef FW_DUMP
				String raw;
				serializeJson(object, raw);
				Serial.printf("[CFG] %s pending=%s\n", raw.c_str(), g_configPending ? "yes" : "no");
			} else if (line.startsWith("SET_CONFIG ")) {
				JsonDocument doc;
				if (deserializeJson(doc, line.substring(11)) != DeserializationError::Ok) {
					Serial.println("[CFG] invalid json");
				} else if (queueConfigObject(doc.as<JsonObject>())) {
					Serial.println("[CFG] queued; applies when idle");
				}
			} else if (line == "RESET_CONFIG") {
				prefs.remove("cfg_json");
				prefs.remove("cfg_rev");
				g_configPending = false;
				g_config = fw::defaultConfig();
				g_configRev = 0;
				g_filter.setConfig(g_config);
				g_heartbeatTimer =
					fw::MinInterval(static_cast<uint32_t>(g_config.heartbeatIntervalS * 1000.0f));
				g_heartbeatTimer.mark(millis());
				Serial.println("[CFG] reset to factory defaults");
			} else if (line == "TEST_WDT") {
#ifdef LIFELINK_BENCH_WDT
				Serial.println("[TEST] TEST_WDT is a bench proof: it blocks until the watchdog "
							   "resets the board.");
				Serial.println("[TEST] send TEST_WDT CONFIRM while Idle; never during an alert");
#else
				Serial.println("[TEST] TEST_WDT is a bench-only command and is not built into "
							   "this firmware; use env:esp32dev-bench");
#endif
			} else if (line == "TEST_WDT CONFIRM") {
#ifdef LIFELINK_BENCH_WDT
				if (g_safety.state() != fw::AlertState::Idle || !g_incidentId.isEmpty() ||
					g_testAlertUntil != 0) {
					Serial.println("[TEST] TEST_WDT refused: the tracker is not Idle");
				} else {
					runWatchdogBenchTest();
				}
#else
				Serial.println("[TEST] TEST_WDT is a bench-only command and is not built into "
							   "this firmware; use env:esp32dev-bench");
#endif
			} else if (line == "REBOOT") {
				ESP.restart();
			}
			line = "";
		} else if (c != '\r') {
			line += c;
		}
	}
}

// ---------------------------------------------------------------------------
// Setup / loop
// ---------------------------------------------------------------------------

void updateStatusLed(uint32_t now) {
	const fw::AlertState state = g_safety.state();
	bool on = false;
	if (state == fw::AlertState::Alerting) {
		on = true;	// solid until acknowledged
	} else if (state == fw::AlertState::Countdown) {
		on = ((now % 300) < 150);
	} else if (state == fw::AlertState::Idle) {
		on = ((now % 2000) < 60);
	}
	digitalWrite(hw::kStatusLed, on ? HIGH : LOW);
}

void setup() {
	Serial.begin(115200);
	delay(250);
	Serial.println();
	Serial.println("[FIRMWARE] LifeLink " FW_VERSION);
	Serial.println(
		"[WIRING] MPU 0x69+DS3231 0x68+OLED 0x3C 21/22, SW-420 27, cancel 33, GPS 16/17, modem "
		"18/19, buzzer 25");
	// Start the watchdog before the boot work. The modem PWRKEY sequence is the
	// longest step at about 11 s, so a setup that hangs also reboots.
	beginWatchdog();

	prefs.begin("lifelink", false);
	g_deviceId = prefs.getString("device_id", chipMac());
	g_deviceToken = prefs.getString("device_token", "");
	g_deviceUuid = prefs.getString("device_uuid", "");
	loadConfig();

	pinMode(hw::kBuzzer, OUTPUT);
	pinMode(hw::kStatusLed, OUTPUT);
	digitalWrite(hw::kStatusLed, LOW);
	digitalWrite(hw::kBuzzer, hw::kBuzzerActiveHigh ? LOW : HIGH);
	pinMode(hw::kVibrationSensor, INPUT);
	pinMode(hw::kCancelButton, INPUT_PULLUP);
	pinMode(hw::kWifiResetButton, INPUT_PULLUP);
	pinMode(hw::kFactoryResetButton, INPUT_PULLUP);
	pinMode(hw::kBatteryAdc, INPUT);
	pinMode(hw::kIgnitionAdc, INPUT);
	analogReadResolution(12);

	Wire.begin(hw::kI2cSda, hw::kI2cScl);
	// The DS3231 owns 0x68. Initialise it before the MPU probe so a missing
	// clock is reported once, then the tracker continues on GPS time.
	if (g_rtc.begin()) {
		Serial.println("[RTC] DS3231 ready at 0x68");
		if (g_rtc.lostPower()) {
			Serial.println("[RTC] lost power - set the time with SET_TIME <epoch> or wait for GPS");
		}
	} else {
		Serial.println("[RTC] no DS3231 - continuing without it");
	}

	// The DS3231 owns 0x68, so the MPU-6050 is strapped to 0x69 by tying AD0 to
	// 3.3V. No pin changes: both stay on the shared 21/22 bus.
	g_mpuOk = mpu.begin(0x69);
	if (!g_mpuOk) {
		g_faults.raise(fw::Fault::Imu);
		Serial.println("[IMU] MPU-6050 not found at 0x69");
	} else {
		// 15 g threshold plus headroom; the 8 g range would clip a severe impact.
		mpu.setAccelerometerRange(MPU6050_RANGE_16_G);
		mpu.setGyroRange(MPU6050_RANGE_500_DEG);
		mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
		Serial.println("[IMU] MPU-6050 ready at 0x69");
	}

	// The panel is optional. A missing panel or a failed init leaves the
	// tracker running with no display, exactly as before.
	if (g_display.begin()) {
		Serial.println("[OLED] SSD1306 ready at 0x3C");
	} else {
		Serial.println("[OLED] no SSD1306 at 0x3C - continuing without a display");
	}

	gpsSerial.begin(hw::kGpsBaud, SERIAL_8N1, hw::kGpsRx, hw::kGpsTx);
	modemSerial.begin(hw::kModemBaud, SERIAL_8N1, hw::kModemRx, hw::kModemTx);
	modemPowerOn();

	g_buzzer.setPattern(fw::BuzzerPattern::Off, millis());
	g_heartbeatTimer.mark(millis());
	g_commandTimer.mark(millis());

	Serial.print("[IDENTITY] ");
	Serial.println(g_deviceId);
	if (g_deviceToken.isEmpty()) {
		Serial.println("[SETUP] No token. Use the WiFi setup portal or send SET_TOKEN llk_...");
		Serial.println("[SETUP] Then: SET_PHONE1 +63... and SET_PLATE ABC1234");
	}
	Serial.println(
		"[RESET] WiFi button (GPIO 13) 5 s clears WiFi; factory button (GPIO 14) 10 s clears "
		"everything");
	g_bootReset.begin(millis());
	g_factoryReset.beginFactory(millis());
	setupWifiCommissioning();
	Serial.println("[READY] LifeLink tracker online");
}

void loop() {
	// A new iteration started, so the previous one returned. Every feed below
	// marks a completed bounded phase; none sits inside a wait.
	feedWatchdog();
	handleSerialProvisioning();
	readGps();
	applyPendingConfig();

	const uint32_t now = millis();
	serviceRtcSync(now);

	if (g_sampleCount == 0 || (now - g_lastImuMs) >= 20) {
		g_lastImuMs = now;

		float accelG = 0.0f;
		float tiltDeg = 0.0f;
		bool vibration = digitalRead(hw::kVibrationSensor) == HIGH;	 // active HIGH on this module

		if (g_mpuOk) {
			sensors_event_t acceleration;
			sensors_event_t gyro;
			sensors_event_t temperature;
			mpu.getEvent(&acceleration, &gyro, &temperature);
			const float ax = acceleration.acceleration.x;
			const float ay = acceleration.acceleration.y;
			const float az = acceleration.acceleration.z;
			const float magnitude = sqrtf(ax * ax + ay * ay + az * az);
			accelG = magnitude / 9.80665f;
			tiltDeg = atan2f(sqrtf(ax * ax + ay * ay), az) * 180.0f / PI;
		}

		const float speedKph = gps.speed.isValid() ? gps.speed.kmph() : 0.0f;
		const bool ignition = readIgnition();
		pushSample(gpsEpochSeconds() > 0 ? gpsEpochSeconds() : now / 1000, accelG, tiltDeg);

		const fw::ImuSample sample = {accelG, tiltDeg, vibration, speedKph, ignition, now};
		const fw::ImpactDecision decision = g_filter.update(sample);

		if (decision == fw::ImpactDecision::Confirm) {
			g_incidentId = newIncidentId();
			g_detectedAt = bestEpochSeconds();
			g_sentAt = 0;
			g_peakAccel = g_filter.lastPeakAccelG();
			g_peakTilt = g_filter.lastPeakTiltDeg();
			g_vibrationCount = g_filter.lastVibrationCount();
			if (g_peakAccel <= 0) g_peakAccel = accelG;
			if (g_peakTilt <= 0) g_peakTilt = tiltDeg;

			Serial.printf("[IMPACT] confirmed peak=%.2fg tilt=%.0f vib=%d\n", g_peakAccel,
						  g_peakTilt, g_vibrationCount);
			g_safety.startCountdown(now, g_config);
			g_buzzer.setPattern(fw::BuzzerPattern::Countdown, now);
			if (g_display.present()) {
				// One bounded frame (about 25 ms at 400 kHz) records the impact
				// time for the driver. showNow() ignores the home screen's
				// redraw gap, so the frame is not dropped when the clock changed
				// just before the impact. It sits outside serviceDisplay, which
				// is Idle-only, and is the only display I2C in the alert path:
				// no delay and no retry.
				g_display.showNow(fw::incidentScreen(g_detectedAt), now);
			}
			sendIncident("SUSPECTED", false);
			// A driver cancel in the same pass may follow with sendCancel().
			feedWatchdog();
		} else if (decision == fw::ImpactDecision::Reject) {
			Serial.println("[IMPACT] rejected as a false positive");
		}

		const bool cancelPressed =
			g_cancelDebouncer.update(digitalRead(hw::kCancelButton) == LOW, now);
		const fw::AlertState state = g_safety.update(now, cancelPressed);

		if (state == fw::AlertState::Cancelled && g_lastState != fw::AlertState::Cancelled) {
			Serial.println("[IMPACT] cancelled by driver");
			sendCancel();
			// The all-clear SMS may follow in this pass after a remote cancel.
			feedWatchdog();
			g_buzzer.setPattern(fw::BuzzerPattern::Cancelled, now);
			g_cancelledAt = now;
		}

		if (state == fw::AlertState::Alerting && g_lastState != fw::AlertState::Alerting) {
			g_alertStartedAt = now;
			// The dispatch time is the countdown expiry, not the retry that
			// happens to leave the modem, and not the sample that noticed the
			// expiry after a blocking modem phase. dispatchSentAt back-dates the
			// observation to the deadline. This transition fires once, so every
			// retry reports the original value. 0 means neither the RTC nor the
			// GPS clock was set; the payload then omits sent_at.
			g_sentAt = fw::dispatchSentAt(bestEpochSeconds(), now, g_safety.countdownEndMs());
			g_buzzer.setPattern(fw::BuzzerPattern::Alerting, now);
		}

		if (state == fw::AlertState::Alerting && g_safety.shouldRetry(now)) {
			sendSmsAlerts();
			// Two SMS are bounded at 54 s and the incident POST at 87 s. The
			// feed sits between them, not inside either wait, so an SOS that
			// hangs still trips the watchdog.
			feedWatchdog();
			sendIncident("CONFIRMED", false);
			g_safety.markAlertSent(now);
		}

		// Alerting is latched until ACK_INCIDENT, so the alarm has no timed
		// exit. After ten minutes it falls back to a slower reminder pattern
		// instead of going silent.
		if (state == fw::AlertState::Alerting) {
			const fw::BuzzerPattern pattern = fw::alertingPattern(now - g_alertStartedAt);
			if (g_buzzer.pattern() != pattern) g_buzzer.setPattern(pattern, now);
		}

		if (state == fw::AlertState::Cancelled && (now - g_cancelledAt) > 5000UL) {
			g_safety.reset();
			g_buzzer.setPattern(fw::BuzzerPattern::Off, now);
		}

		if (state == fw::AlertState::PostAlert && g_lastState != fw::AlertState::PostAlert) {
			g_postAlertAt = now;
			g_buzzer.setPattern(fw::BuzzerPattern::Off, now);
		}

		if (state == fw::AlertState::PostAlert && (now - g_postAlertAt) > 5UL * 60UL * 1000UL) {
			g_safety.reset();
		}

		if (g_allClearPending && state != fw::AlertState::Alerting) {
			g_allClearPending = false;
			sendAllClearSms();
			feedWatchdog();
		}

		g_lastState = state;
		// Boot-only commissioning reset. It is disabled permanently as soon as
		// the alert state machine leaves Idle, so a long cancel press during a
		// countdown can never reboot the tracker.
		serviceBootReset(now, state != fw::AlertState::Idle);
		updateStatusLed(now);
	}

	// The impact/alert pass above can include two SMS and an incident POST; it
	// is complete here.
	feedWatchdog();

	// WiFi is serviced after the impact/alert pass so the safety-critical sample
	// is always taken before any portal work. The setup portal has no inner
	// loop: it is one bounded pass of this function, and a request that hangs
	// never reaches the feed below.
	serviceWifiCommissioning(millis());
	feedWatchdog();

	if (g_testAlertUntil > 0 && now > g_testAlertUntil) {
		g_buzzer.setPattern(fw::BuzzerPattern::Off, now);
		g_testAlertUntil = 0;
	}

	const bool buzzerOn = g_buzzer.isOn(now);
	digitalWrite(hw::kBuzzer, buzzerOn == hw::kBuzzerActiveHigh ? HIGH : LOW);

	// The display is serviced after the buzzer and before the modem block. It
	// returns immediately while the alert state is not Idle and bounds its own
	// frame rate, so it cannot delay the alert path, a modem timeout or the
	// command poll.
	serviceDisplay(millis());

	if (!g_deviceToken.isEmpty()) {
		if (g_heartbeatTimer.ready(now)) {
			g_heartbeatTimer.mark(now);
			const float batteryV = readBatteryVoltage();
			const String body = heartbeatPayload(
				0, 0, false, gps.speed.isValid() ? gps.speed.kmph() : 0, batteryV, readIgnition());
			modemHttpRequest("POST", "/api/device/ingest", body, nullptr);
			// One heartbeat is bounded at 90 s (signal query plus POST).
			feedWatchdog();
		}

		if (g_commandTimer.ready(now)) {
			g_commandTimer.mark(now);
			pollCommands();
			// pollCommands feeds per command, so the poll GET and the last ACK
			// are each bounded below the timeout.
			feedWatchdog();
		}
	}

	if ((now - g_lastGpsLogMs) > 30000UL) {
		g_lastGpsLogMs = now;
		Serial.printf("[GPS] fix=%d sats=%u speed=%.0fkph age=%lus\n",
					  gps.location.isValid() ? 1 : 0, static_cast<unsigned>(gps.satellites.value()),
					  gps.speed.isValid() ? gps.speed.kmph() : 0.0,
					  gps.location.isValid() ? gps.location.age() / 1000UL : 0UL);
	}

	delay(1);
}
