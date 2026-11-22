/*
  LifeLink tracker firmware — ESP32 DevKit V1 (30-pin).

  Flow:
	IMU + vibration + GPS -> ImpactFilter -> CrashSafety countdown
	  cancel button within the window  -> SMS/incident cancelled
	  window expires                   -> SMS to configured phones + HTTP incident
	Heartbeat and command polling run on a non-blocking interval.

  This sketch is deliberately explicit about what is verified and what still
  needs a bench check:
  - the pure logic (filters, safety, power, SMS body) is covered by native tests
  - the A7670E AT sequence, SIM/APN, GPS cold start and 4G current spikes must
	be verified on the actual hardware
  - the API base URL and provisioning token are not compiled in

  Provision over USB serial (115200):
	SET_ID AA:BB:CC:DD:EE:01
	SET_TOKEN llk_...
	SET_PHONE1 +639171234567
	SET_PHONE2 +639181234567
	STATUS
*/
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <TinyGPSPlus.h>
#include <Wire.h>
#include <math.h>

#include "config.h"
#include "filters.h"
#include "gps.h"
#include "hardware.h"
#include "modem.h"
#include "power.h"
#include "safety.h"
#include "status.h"

#if __has_include("secrets.h")
#include "secrets.h"
#endif

#ifndef FW_VERSION
#define FW_VERSION "0.1.0"
#endif

#ifndef LIFELINK_API_BASE
#define LIFELINK_API_BASE "https://lifelink.example.com"
#endif

TinyGPSPlus gps;
Adafruit_MPU6050 mpu;
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

String g_deviceId;
String g_deviceToken;
uint32_t g_configRev = 0;
bool g_armed = true;
bool g_mpuOk = false;

fw::AlertState g_lastState = fw::AlertState::Idle;
uint32_t g_cancelledAt = 0;
uint32_t g_postAlertAt = 0;
uint32_t g_alertStartedAt = 0;
uint32_t g_testAlertUntil = 0;

String g_incidentId;
uint32_t g_detectedAt = 0;
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

bool applyConfigObject(JsonObject config, bool persist) {
	if (config.isNull()) return false;
	if (!config["version"].is<int>() || config["version"].as<int>() != fw::kConfigContractVersion) {
		return false;
	}

	fw::DeviceConfig next = g_config;
#define FW_APPLY(name, key, min, max, integer, def) \
	if (!config[key].isNull()) next.name = config[key].as<float>();
	FW_CONFIG_FIELDS(FW_APPLY)
#undef FW_APPLY

	if (!fw::validateConfig(next)) {
		Serial.println("[CFG] rejected: out of envelope");
		return false;
	}

	g_config = next;
	g_filter.setConfig(next);
	g_heartbeatTimer =
		fw::MinInterval(static_cast<uint32_t>(g_config.heartbeatIntervalS * 1000.0f));
	g_heartbeatTimer.mark(millis());

	if (persist) {
		String raw;
		serializeJson(config, raw);
		prefs.putString("cfg_json", raw);
		prefs.putUInt("cfg_rev", config["rev"] | 0);
		g_configRev = config["rev"] | 0;
	}
	return true;
}

void loadConfig() {
	g_config = fw::defaultConfig();
	const String raw = prefs.getString("cfg_json", "");
	g_configRev = prefs.getUInt("cfg_rev", 0);
	if (raw.isEmpty()) return;
	JsonDocument doc;
	if (deserializeJson(doc, raw) != DeserializationError::Ok) return;
	JsonObject object = doc.as<JsonObject>();
	// applyConfigObject persists; a boot load should not rewrite NVS.
	if (!applyConfigObject(object, false)) {
		g_config = fw::defaultConfig();
	}
	g_filter.setConfig(g_config);
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
	if (!phone2.isEmpty()) sent = sendSms(phone2, String(bodyBuffer)) || sent;
	Serial.println(sent ? "[SOS] SMS sent" : "[SOS] SMS failed or no phone configured");
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
		const String id = command["id"] | "";
		const String kind = command["kind"] | "";
		if (id.isEmpty()) continue;

		Serial.print("[CMD] ");
		Serial.println(kind);

		if (kind == "LOCATE") {
			const String body = heartbeatPayload(0, 0, false, 0, 0, false);
			modemHttpRequest("POST", "/api/device/ingest", body, nullptr);
		} else if (kind == "TEST_ALERT") {
			g_buzzer.setPattern(fw::BuzzerPattern::Alerting, millis());
			g_testAlertUntil = millis() + 3000;
		} else if (kind == "ARM") {
			g_armed = true;
		} else if (kind == "DISARM") {
			g_armed = false;
		} else if (kind == "SET_CONFIG") {
			// The config object is applied from the same poll response.
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
		String raw;
		serializeJson(config, raw);
		if (applyConfigObject(config, false)) {
			prefs.putString("cfg_json", raw);
			prefs.putUInt("cfg_rev", config["rev"] | 0);
			g_configRev = config["rev"] | 0;
			Serial.println("[CFG] applied from server");
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

void setup() {
	Serial.begin(115200);
	delay(250);
	Serial.println();
	Serial.println("[FIRMWARE] LifeLink " FW_VERSION);
	Serial.println("[WIRING] MPU 21/22, SW-420 32, cancel 33, GPS 26/27, modem 16/17, buzzer 25");

	prefs.begin("lifelink", false);
	g_deviceId = prefs.getString("device_id", chipMac());
	g_deviceToken = prefs.getString("device_token", "");
	loadConfig();

	pinMode(hw::kBuzzer, OUTPUT);
	digitalWrite(hw::kBuzzer, hw::kBuzzerActiveHigh ? LOW : HIGH);
	pinMode(hw::kVibrationSensor, INPUT);
	pinMode(hw::kCancelButton, INPUT_PULLUP);
	pinMode(hw::kBatteryAdc, INPUT);
	pinMode(hw::kIgnitionAdc, INPUT);
	analogReadResolution(12);

	Wire.begin(hw::kI2cSda, hw::kI2cScl);
	g_mpuOk = mpu.begin();
	if (!g_mpuOk) {
		g_faults.raise(fw::Fault::Imu);
		Serial.println("[IMU] MPU-6050 not found");
	} else {
		mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
		mpu.setGyroRange(MPU6050_RANGE_500_DEG);
		mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
		Serial.println("[IMU] MPU-6050 ready");
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
		Serial.println("[SETUP] No token. Send: SET_TOKEN llk_... and SET_ID <MAC>");
		Serial.println("[SETUP] Then: SET_PHONE1 +63... and SET_PLATE ABC1234");
	}
	Serial.println("[READY] LifeLink tracker online");
}

void loop() {
	handleSerialProvisioning();
	readGps();

	const uint32_t now = millis();
	if (g_sampleCount == 0 || (now - g_lastImuMs) >= 20) {
		g_lastImuMs = now;

		float accelG = 0.0f;
		float tiltDeg = 0.0f;
		bool vibration = digitalRead(hw::kVibrationSensor) == LOW;

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
			g_detectedAt = gpsEpochSeconds();
			g_peakAccel = g_filter.lastPeakAccelG();
			g_peakTilt = g_filter.lastPeakTiltDeg();
			g_vibrationCount = g_filter.lastVibrationCount();
			if (g_peakAccel <= 0) g_peakAccel = accelG;
			if (g_peakTilt <= 0) g_peakTilt = tiltDeg;

			Serial.printf("[IMPACT] confirmed peak=%.2fg tilt=%.0f vib=%d\n", g_peakAccel,
						  g_peakTilt, g_vibrationCount);
			g_safety.startCountdown(now, g_config);
			g_buzzer.setPattern(fw::BuzzerPattern::Countdown, now);
			sendIncident("SUSPECTED", false);
		} else if (decision == fw::ImpactDecision::Reject) {
			Serial.println("[IMPACT] rejected as a false positive");
		}

		const bool cancelPressed =
			g_cancelDebouncer.update(digitalRead(hw::kCancelButton) == LOW, now);
		const fw::AlertState state = g_safety.update(now, cancelPressed);

		if (state == fw::AlertState::Cancelled && g_lastState != fw::AlertState::Cancelled) {
			Serial.println("[IMPACT] cancelled by driver");
			sendCancel();
			g_buzzer.setPattern(fw::BuzzerPattern::Cancelled, now);
			g_cancelledAt = now;
		}

		if (state == fw::AlertState::Alerting && g_lastState != fw::AlertState::Alerting) {
			g_alertStartedAt = now;
			g_buzzer.setPattern(fw::BuzzerPattern::Alerting, now);
		}

		if (state == fw::AlertState::Alerting && g_safety.shouldRetry(now)) {
			sendSmsAlerts();
			sendIncident("CONFIRMED", false);
			g_safety.markAlertSent(now);
		}

		if (state == fw::AlertState::Alerting && (now - g_alertStartedAt) > 10UL * 60UL * 1000UL) {
			Serial.println("[SOS] retry window elapsed; keeping the incident open");
			g_safety.stopAlerting();
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

		g_lastState = state;
	}

	if (g_testAlertUntil > 0 && now > g_testAlertUntil) {
		g_buzzer.setPattern(fw::BuzzerPattern::Off, now);
		g_testAlertUntil = 0;
	}

	const bool buzzerOn = g_buzzer.isOn(now);
	digitalWrite(hw::kBuzzer, buzzerOn == hw::kBuzzerActiveHigh ? HIGH : LOW);

	if (!g_deviceToken.isEmpty()) {
		if (g_heartbeatTimer.ready(now)) {
			g_heartbeatTimer.mark(now);
			const float batteryV = readBatteryVoltage();
			const String body = heartbeatPayload(
				0, 0, false, gps.speed.isValid() ? gps.speed.kmph() : 0, batteryV, readIgnition());
			modemHttpRequest("POST", "/api/device/ingest", body, nullptr);
		}

		if (g_commandTimer.ready(now)) {
			g_commandTimer.mark(now);
			pollCommands();
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
