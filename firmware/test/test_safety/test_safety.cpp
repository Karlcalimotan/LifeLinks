/*
  Native tests for countdown, cancel, retry, safe mode, faults, power, GPS and
  the SMS body.

  Run with: pio test -d firmware -e native
*/
#include <unity.h>

#include "../../main/config.h"
#include "../../main/gps.h"
#include "../../main/modem.h"
#include "../../main/power.h"
#include "../../main/safety.h"
#include "../../main/status.h"

using namespace fw;

void setUp(void) {}
void tearDown(void) {}

static GpsFix goodFix() {
	return GpsFix{true, 10.3157, 123.8854, 3000, 8, 1.2f};
}

void test_countdown_expires_into_alerting(void) {
	CrashSafety safety;
	DeviceConfig config = defaultConfig();
	safety.startCountdown(1000, config);
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Countdown), static_cast<int>(safety.state()));
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Alerting),
	                  static_cast<int>(safety.update(1000 + 15000, false)));
}

void test_cancel_inside_the_window_wins(void) {
	CrashSafety safety;
	DeviceConfig config = defaultConfig();
	safety.startCountdown(0, config);
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Cancelled),
	                  static_cast<int>(safety.update(5000, true)));
}

void test_retry_becomes_due_after_the_interval(void) {
	CrashSafety safety;
	DeviceConfig config = defaultConfig();
	safety.startCountdown(0, config);
	safety.update(15000, false);
	TEST_ASSERT_TRUE(safety.shouldRetry(15000));
	safety.markAlertSent(15000);
	TEST_ASSERT_FALSE(safety.shouldRetry(20000));
	TEST_ASSERT_TRUE(safety.shouldRetry(15000 + 60000));
}

void test_safe_mode_never_blocks_alerting(void) {
	TEST_ASSERT_TRUE(alertingAllowed(false));
	TEST_ASSERT_TRUE(alertingAllowed(true));
}

void test_faults_latch_until_acknowledged(void) {
	FaultManager faults;
	faults.raise(Fault::Gps);
	TEST_ASSERT_TRUE(faults.hasFault());
	faults.clear(Fault::Gps);
	TEST_ASSERT_TRUE(faults.acknowledge());
	TEST_ASSERT_FALSE(faults.hasFault());
}

void test_three_abnormal_resets_enter_safe_mode(void) {
	ResetHistory history;
	history.record(1000, true);
	history.record(2000, true);
	history.record(3000, true);
	TEST_ASSERT_TRUE(history.shouldEnterSafeMode(4000, 600000, 3));
}

void test_normal_reset_clears_the_history(void) {
	ResetHistory history;
	history.record(1000, true);
	history.record(2000, true);
	history.record(3000, false);
	history.record(4000, true);
	TEST_ASSERT_FALSE(history.shouldEnterSafeMode(5000, 600000, 3));
}

void test_buzzer_patterns_alternate(void) {
	BuzzerController buzzer;
	buzzer.setPattern(BuzzerPattern::Alerting, 0);
	TEST_ASSERT_TRUE(buzzer.isOn(0));
	TEST_ASSERT_TRUE(buzzer.isOn(499));
	TEST_ASSERT_FALSE(buzzer.isOn(500));
	TEST_ASSERT_TRUE(buzzer.isOn(1000));
}

void test_power_classification_and_adc(void) {
	TEST_ASSERT_EQUAL(static_cast<int>(PowerState::Main),
	                  static_cast<int>(classifyPower(true, 12.5f)));
	TEST_ASSERT_EQUAL(static_cast<int>(PowerState::Backup),
	                  static_cast<int>(classifyPower(false, 12.5f)));
	TEST_ASSERT_EQUAL(static_cast<int>(PowerState::Critical),
	                  static_cast<int>(classifyPower(true, 10.5f)));
	TEST_ASSERT_TRUE(nearlyEqual(adcToVoltage(2048, 5.0f), 8.25f, 0.01f));
}

void test_gps_fix_quality(void) {
	GpsFix fix = goodFix();
	TEST_ASSERT_TRUE(hasUsableFix(fix));
	fix.satellites = 3;
	TEST_ASSERT_FALSE(hasUsableFix(fix));
}

void test_sms_body_is_safe_and_bounded(void) {
	GpsFix fix = goodFix();
	char body[kSmsMaxBytes];
	const size_t length = buildSosSms(body, sizeof(body), "ABC 1234", fix, 45.0f, "+639171234567");
	TEST_ASSERT_TRUE(length > 0);
	TEST_ASSERT_TRUE(smsFits(body));
	TEST_ASSERT_NOT_NULL(strstr(body, "LIFELINK SOS"));
	TEST_ASSERT_NOT_NULL(strstr(body, "ABC 1234"));
}

int main(int, char**) {
	UNITY_BEGIN();
	RUN_TEST(test_countdown_expires_into_alerting);
	RUN_TEST(test_cancel_inside_the_window_wins);
	RUN_TEST(test_retry_becomes_due_after_the_interval);
	RUN_TEST(test_safe_mode_never_blocks_alerting);
	RUN_TEST(test_faults_latch_until_acknowledged);
	RUN_TEST(test_three_abnormal_resets_enter_safe_mode);
	RUN_TEST(test_normal_reset_clears_the_history);
	RUN_TEST(test_buzzer_patterns_alternate);
	RUN_TEST(test_power_classification_and_adc);
	RUN_TEST(test_gps_fix_quality);
	RUN_TEST(test_sms_body_is_safe_and_bounded);
	return UNITY_END();
}
