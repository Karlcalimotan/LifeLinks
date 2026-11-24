/*
  Native tests for the LifeLink configuration envelope.

  Run with: pio test -d firmware -e native
*/
#include <unity.h>

#include <math.h>

#include "../../main/config.h"

using namespace fw;

void setUp(void) {}
void tearDown(void) {}

void test_defaults_match_the_spec_table(void) {
	const DeviceConfig config = defaultConfig();
	TEST_ASSERT_TRUE(nearlyEqual(config.impactThresholdG, 15.0f));
	TEST_ASSERT_TRUE(nearlyEqual(config.tiltThresholdDeg, 60.0f));
	TEST_ASSERT_TRUE(nearlyEqual(config.confirmWindowMs, 200.0f));
	TEST_ASSERT_TRUE(nearlyEqual(config.cancelWindowS, 15.0f));
	TEST_ASSERT_TRUE(nearlyEqual(config.heartbeatIntervalS, 30.0f));
	TEST_ASSERT_TRUE(nearlyEqual(config.sosRetryS, 60.0f));
	TEST_ASSERT_EQUAL_INT(6, static_cast<int>(kSpecCount));
}

void test_defaults_are_inside_the_envelope(void) {
	TEST_ASSERT_TRUE(validateConfig(defaultConfig()));
}

void test_below_the_impact_floor_is_rejected(void) {
	DeviceConfig config = defaultConfig();
	config.impactThresholdG = 1.0f;
	TEST_ASSERT_FALSE(validateConfig(config));
}

void test_above_the_tilt_ceiling_is_rejected(void) {
	DeviceConfig config = defaultConfig();
	config.tiltThresholdDeg = 120.0f;
	TEST_ASSERT_FALSE(validateConfig(config));
}

void test_whole_number_fields_reject_a_fraction(void) {
	DeviceConfig config = defaultConfig();
	config.cancelWindowS = 15.5f;
	TEST_ASSERT_FALSE(validateConfig(config));
}

void test_contract_version_is_exact(void) {
	TEST_ASSERT_TRUE(contractVersionSupported(1));
	TEST_ASSERT_FALSE(contractVersionSupported(2));
	TEST_ASSERT_FALSE(contractVersionSupported(0));
}

int main(int, char**) {
	UNITY_BEGIN();
	RUN_TEST(test_defaults_match_the_spec_table);
	RUN_TEST(test_defaults_are_inside_the_envelope);
	RUN_TEST(test_below_the_impact_floor_is_rejected);
	RUN_TEST(test_above_the_tilt_ceiling_is_rejected);
	RUN_TEST(test_whole_number_fields_reject_a_fraction);
	RUN_TEST(test_contract_version_is_exact);
	return UNITY_END();
}
