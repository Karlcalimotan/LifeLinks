/*
  Native tests for the config apply gate.
*/
#include <unity.h>

#include "../../main/config_apply.h"
#include "../../main/safety.h"

using namespace fw;

void setUp(void) {}
void tearDown(void) {}

void test_config_applies_only_when_idle(void) {
	TEST_ASSERT_TRUE(canApplyConfig(AlertState::Idle));
	TEST_ASSERT_FALSE(canApplyConfig(AlertState::Countdown));
	TEST_ASSERT_FALSE(canApplyConfig(AlertState::Alerting));
	TEST_ASSERT_FALSE(canApplyConfig(AlertState::Cancelled));
	TEST_ASSERT_FALSE(canApplyConfig(AlertState::PostAlert));
}

int main(int, char**) {
	UNITY_BEGIN();
	RUN_TEST(test_config_applies_only_when_idle);
	return UNITY_END();
}
