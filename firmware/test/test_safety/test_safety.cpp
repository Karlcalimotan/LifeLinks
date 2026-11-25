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
	buzzer.setPattern(BuzzerPattern::Countdown, 0);
	TEST_ASSERT_TRUE(buzzer.isOn(0));
	TEST_ASSERT_TRUE(buzzer.isOn(149));
	TEST_ASSERT_FALSE(buzzer.isOn(150));
	TEST_ASSERT_TRUE(buzzer.isOn(1000));
}

void test_alerting_is_a_long_beep(void) {
	BuzzerController buzzer;
	buzzer.setPattern(BuzzerPattern::Alerting, 0);
	TEST_ASSERT_TRUE(buzzer.isOn(0));
	TEST_ASSERT_TRUE(buzzer.isOn(1999));
	TEST_ASSERT_FALSE(buzzer.isOn(2000));
	TEST_ASSERT_TRUE(buzzer.isOn(3000));
}

void test_reminder_is_slower_but_never_silent(void) {
	BuzzerController buzzer;
	buzzer.setPattern(BuzzerPattern::Reminder, 0);
	TEST_ASSERT_TRUE(buzzer.isOn(0));
	TEST_ASSERT_TRUE(buzzer.isOn(999));
	TEST_ASSERT_FALSE(buzzer.isOn(1000));
	TEST_ASSERT_FALSE(buzzer.isOn(5999));
	TEST_ASSERT_TRUE(buzzer.isOn(6000));
}

void test_alerting_pattern_switches_to_reminder_after_ten_minutes(void) {
	TEST_ASSERT_EQUAL(static_cast<int>(BuzzerPattern::Alerting),
	                  static_cast<int>(alertingPattern(0)));
	TEST_ASSERT_EQUAL(static_cast<int>(BuzzerPattern::Alerting),
	                  static_cast<int>(alertingPattern(kAlertReminderAfterMs - 1)));
	TEST_ASSERT_EQUAL(static_cast<int>(BuzzerPattern::Reminder),
	                  static_cast<int>(alertingPattern(kAlertReminderAfterMs)));
}

void test_dispatch_sent_at_is_back_dated_to_the_countdown_expiry(void) {
	const uint32_t expiry = 15000;
	// Observed exactly at the deadline: no correction.
	TEST_ASSERT_EQUAL_UINT32(1700000000, dispatchSentAt(1700000000, expiry, expiry));
	// Observed 7 s late after a blocking phase: the expiry, not the observation.
	TEST_ASSERT_EQUAL_UINT32(1700000001, dispatchSentAt(1700000008, expiry + 7000, expiry));
	// An unset GPS clock stays unset, so the report omits sent_at.
	TEST_ASSERT_EQUAL_UINT32(0, dispatchSentAt(0, expiry + 7000, expiry));
	// Lateness beyond the guard is a clock anomaly, not a correction.
	TEST_ASSERT_EQUAL_UINT32(
	    1700000400, dispatchSentAt(1700000400, expiry + kMaxExpiryCorrectionMs + 1, expiry));
	// A deadline still in the future is an anomaly too.
	TEST_ASSERT_EQUAL_UINT32(1700000000, dispatchSentAt(1700000000, expiry - 1000, expiry));
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

void test_remote_cancel_during_countdown_wins(void) {
	CrashSafety safety;
	DeviceConfig config = defaultConfig();
	safety.startCountdown(0, config);
	TEST_ASSERT_TRUE(safety.cancelFromRemote());
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Cancelled),
	                  static_cast<int>(safety.state()));
}

void test_remote_cancel_after_dispatch_stops_retries(void) {
	CrashSafety safety;
	DeviceConfig config = defaultConfig();
	safety.startCountdown(0, config);
	safety.update(15000, false);
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Alerting),
	                  static_cast<int>(safety.state()));
	TEST_ASSERT_TRUE(safety.cancelFromRemote());
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::PostAlert),
	                  static_cast<int>(safety.state()));
	TEST_ASSERT_FALSE(safety.shouldRetry(16000));
}

void test_remote_cancel_is_ignored_when_idle_or_acknowledged(void) {
	CrashSafety safety;
	TEST_ASSERT_FALSE(safety.cancelFromRemote());

	DeviceConfig config = defaultConfig();
	safety.startCountdown(0, config);
	safety.update(15000, false);
	safety.markAcknowledged();
	TEST_ASSERT_FALSE(safety.cancelFromRemote());
}

void test_alerting_never_expires_on_a_timer(void) {
	CrashSafety safety;
	DeviceConfig config = defaultConfig();
	safety.startCountdown(0, config);
	safety.update(15000, false);

	const uint32_t wellPastTenMinutes = 15000 + kAlertReminderAfterMs + 1;
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Alerting),
	                  static_cast<int>(safety.update(wellPastTenMinutes, false)));
	TEST_ASSERT_TRUE(safety.shouldRetry(wellPastTenMinutes));

	safety.markAlertSent(wellPastTenMinutes);
	TEST_ASSERT_TRUE(safety.shouldRetry(wellPastTenMinutes + 60000));
}

void test_ack_incident_matching_id_returns_to_idle(void) {
	CrashSafety safety;
	DeviceConfig config = defaultConfig();
	safety.startCountdown(0, config);
	safety.update(15000, false);

	TEST_ASSERT_EQUAL(static_cast<int>(IncidentAck::Acknowledged),
	                  static_cast<int>(
	                      safety.acknowledgeIncident("llk-1a2b3c4d-00001234",
	                                                 "llk-1a2b3c4d-00001234")));
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Idle), static_cast<int>(safety.state()));
	TEST_ASSERT_FALSE(safety.shouldRetry(20000));
	// A late update must not resurrect the acknowledged alarm.
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Idle),
	                  static_cast<int>(safety.update(600000, false)));
}

void test_ack_incident_with_a_different_or_missing_id_changes_nothing(void) {
	CrashSafety safety;
	DeviceConfig config = defaultConfig();
	safety.startCountdown(0, config);
	safety.update(15000, false);

	TEST_ASSERT_EQUAL(static_cast<int>(IncidentAck::UnknownIncident),
	                  static_cast<int>(safety.acknowledgeIncident("llk-other", "llk-active")));
	TEST_ASSERT_EQUAL(static_cast<int>(IncidentAck::UnknownIncident),
	                  static_cast<int>(safety.acknowledgeIncident("", "llk-active")));
	TEST_ASSERT_EQUAL(static_cast<int>(IncidentAck::UnknownIncident),
	                  static_cast<int>(safety.acknowledgeIncident(nullptr, "llk-active")));
	TEST_ASSERT_EQUAL(static_cast<int>(IncidentAck::UnknownIncident),
	                  static_cast<int>(safety.acknowledgeIncident("llk-active", "")));
	TEST_ASSERT_EQUAL(static_cast<int>(IncidentAck::UnknownIncident),
	                  static_cast<int>(safety.acknowledgeIncident("llk-active", nullptr)));

	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Alerting), static_cast<int>(safety.state()));
	TEST_ASSERT_TRUE(safety.shouldRetry(16000));
}

void test_ack_incident_during_countdown_never_suppresses_the_alert(void) {
	CrashSafety safety;
	DeviceConfig config = defaultConfig();
	safety.startCountdown(0, config);

	TEST_ASSERT_EQUAL(static_cast<int>(IncidentAck::UnknownIncident),
	                  static_cast<int>(safety.acknowledgeIncident("llk-active", "llk-active")));
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Countdown),
	                  static_cast<int>(safety.state()));
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Alerting),
	                  static_cast<int>(safety.update(15000, false)));
}

void test_ack_incident_when_idle_is_unknown(void) {
	CrashSafety safety;
	TEST_ASSERT_EQUAL(static_cast<int>(IncidentAck::UnknownIncident),
	                  static_cast<int>(safety.acknowledgeIncident("llk-active", "llk-active")));
	TEST_ASSERT_EQUAL(static_cast<int>(AlertState::Idle), static_cast<int>(safety.state()));
}

int main(int, char**) {
	UNITY_BEGIN();
	RUN_TEST(test_countdown_expires_into_alerting);
	RUN_TEST(test_cancel_inside_the_window_wins);
	RUN_TEST(test_retry_becomes_due_after_the_interval);
	RUN_TEST(test_remote_cancel_during_countdown_wins);
	RUN_TEST(test_remote_cancel_after_dispatch_stops_retries);
	RUN_TEST(test_remote_cancel_is_ignored_when_idle_or_acknowledged);
	RUN_TEST(test_alerting_never_expires_on_a_timer);
	RUN_TEST(test_ack_incident_matching_id_returns_to_idle);
	RUN_TEST(test_ack_incident_with_a_different_or_missing_id_changes_nothing);
	RUN_TEST(test_ack_incident_during_countdown_never_suppresses_the_alert);
	RUN_TEST(test_ack_incident_when_idle_is_unknown);
	RUN_TEST(test_safe_mode_never_blocks_alerting);
	RUN_TEST(test_faults_latch_until_acknowledged);
	RUN_TEST(test_three_abnormal_resets_enter_safe_mode);
	RUN_TEST(test_normal_reset_clears_the_history);
	RUN_TEST(test_buzzer_patterns_alternate);
	RUN_TEST(test_alerting_is_a_long_beep);
	RUN_TEST(test_reminder_is_slower_but_never_silent);
	RUN_TEST(test_alerting_pattern_switches_to_reminder_after_ten_minutes);
	RUN_TEST(test_dispatch_sent_at_is_back_dated_to_the_countdown_expiry);
	RUN_TEST(test_power_classification_and_adc);
	RUN_TEST(test_gps_fix_quality);
	RUN_TEST(test_sms_body_is_safe_and_bounded);
	return UNITY_END();
}
