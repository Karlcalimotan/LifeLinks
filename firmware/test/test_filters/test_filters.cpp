/*
  Native tests for impact/tilt/vibration filtering.

  Run with: pio test -d firmware -e native
*/
#include <unity.h>

#include "../../main/config.h"
#include "../../main/filters.h"

using namespace fw;

void setUp(void) {}
void tearDown(void) {}

static ImuSample sample(float accelG, float tiltDeg, bool vibration, float speedKph, uint32_t ms) {
	return ImuSample{accelG, tiltDeg, vibration, speedKph, true, ms};
}

// The production default is 15 g (severe impacts only). These tests exercise
// the candidate/confirm logic with a lower envelope value so a pothole and a
// normal crash remain distinguishable.
static DeviceConfig normalCrashConfig() {
	DeviceConfig config = defaultConfig();
	config.impactThresholdG = 2.5f;
	return config;
}

void test_a_pothole_is_rejected(void) {
	ImpactFilter filter(normalCrashConfig());
	TEST_ASSERT_EQUAL(static_cast<int>(ImpactDecision::Candidate),
	                  static_cast<int>(filter.update(sample(3.2f, 8.0f, false, 50.0f, 0))));
	TEST_ASSERT_EQUAL(static_cast<int>(ImpactDecision::Reject),
	                  static_cast<int>(filter.update(sample(0.2f, 2.0f, false, 49.0f, 250))));
}

void test_a_crash_is_confirmed(void) {
	ImpactFilter filter(normalCrashConfig());
	TEST_ASSERT_EQUAL(static_cast<int>(ImpactDecision::Candidate),
	                  static_cast<int>(filter.update(sample(3.5f, 55.0f, true, 60.0f, 0))));
	TEST_ASSERT_EQUAL(static_cast<int>(ImpactDecision::Confirm),
	                  static_cast<int>(filter.update(sample(0.4f, 62.0f, true, 40.0f, 250))));
	TEST_ASSERT_TRUE(filter.lastPeakAccelG() >= 3.5f);
	TEST_ASSERT_TRUE(filter.lastVibrationCount() >= 1);
}

void test_a_sustained_rollover_is_confirmed_by_tilt(void) {
	ImpactFilter filter;
	TEST_ASSERT_EQUAL(static_cast<int>(ImpactDecision::None),
	                  static_cast<int>(filter.update(sample(0.2f, 80.0f, false, 20.0f, 0))));
	TEST_ASSERT_EQUAL(static_cast<int>(ImpactDecision::Confirm),
	                  static_cast<int>(filter.update(sample(0.2f, 82.0f, false, 20.0f, 1050))));
}

void test_a_below_threshold_sample_does_not_start_a_candidate(void) {
	ImpactFilter filter;
	TEST_ASSERT_EQUAL(static_cast<int>(ImpactDecision::None),
	                  static_cast<int>(filter.update(sample(2.0f, 10.0f, false, 50.0f, 0))));
}

void test_a_door_slam_at_rest_is_rejected(void) {
	ImpactFilter filter(normalCrashConfig());
	TEST_ASSERT_EQUAL(static_cast<int>(ImpactDecision::Candidate),
	                  static_cast<int>(filter.update(sample(2.8f, 4.0f, false, 0.0f, 0))));
	TEST_ASSERT_EQUAL(static_cast<int>(ImpactDecision::Reject),
	                  static_cast<int>(filter.update(sample(0.1f, 1.0f, false, 0.0f, 300))));
}

void test_a_15g_impact_starts_a_candidate_by_default(void) {
	ImpactFilter filter;
	TEST_ASSERT_EQUAL(static_cast<int>(ImpactDecision::Candidate),
	                  static_cast<int>(filter.update(sample(15.0f, 5.0f, true, 60.0f, 0))));
}

void test_debouncer_fires_once_on_a_stable_change(void) {
	Debouncer debouncer(50, false);
	TEST_ASSERT_FALSE(debouncer.update(true, 0));
	TEST_ASSERT_FALSE(debouncer.update(true, 30));
	TEST_ASSERT_TRUE(debouncer.update(true, 60));
	TEST_ASSERT_TRUE(debouncer.state());
	TEST_ASSERT_FALSE(debouncer.update(true, 90));
}

int main(int, char**) {
	UNITY_BEGIN();
	RUN_TEST(test_a_pothole_is_rejected);
	RUN_TEST(test_a_crash_is_confirmed);
	RUN_TEST(test_a_sustained_rollover_is_confirmed_by_tilt);
	RUN_TEST(test_a_below_threshold_sample_does_not_start_a_candidate);
	RUN_TEST(test_a_door_slam_at_rest_is_rejected);
	RUN_TEST(test_a_15g_impact_starts_a_candidate_by_default);
	RUN_TEST(test_debouncer_fires_once_on_a_stable_change);
	return UNITY_END();
}
