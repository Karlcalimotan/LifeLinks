/*
  Native tests for the DS3231 clock helpers.

  Run with: pio test -d firmware -e native

  rtc_format.h is Arduino-free, so these cover the plausibility window and the
  UTC "HH:MM:SS" layout without a board. The hardware wrapper (rtc.h) needs
  Wire and RTClib and is exercised on the bench, not here.
*/
#include <unity.h>

#include <string.h>

#include "../../main/rtc_format.h"

using namespace fw;

void setUp(void) {}

void tearDown(void) {}

void test_plausible_epoch_accepts_the_supported_window(void) {
	TEST_ASSERT_TRUE(isPlausibleEpoch(1704067200UL));  // 2024-01-01T00:00:00Z
	TEST_ASSERT_TRUE(isPlausibleEpoch(1709210096UL));  // 2024-02-29T12:34:56Z
	TEST_ASSERT_TRUE(isPlausibleEpoch(4102444799UL));  // 2099-12-31T23:59:59Z
}

void test_plausible_epoch_rejects_unset_and_out_of_range(void) {
	TEST_ASSERT_FALSE(isPlausibleEpoch(0));
	TEST_ASSERT_FALSE(isPlausibleEpoch(946684800UL));	// 2000-01-01, an unset DS3231
	TEST_ASSERT_FALSE(isPlausibleEpoch(1704067199UL));	// one second before the window
	TEST_ASSERT_FALSE(isPlausibleEpoch(4102444800UL));	// 2100-01-01
	TEST_ASSERT_FALSE(isPlausibleEpoch(0xFFFFFFFFUL));
}

void test_format_clock_hms_formats_utc_midnight(void) {
	char out[kClockHmsTextMax];
	TEST_ASSERT_TRUE(formatClockHms(1704067200UL, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("00:00:00", out);
}

void test_format_clock_hms_formats_the_end_of_day(void) {
	char out[kClockHmsTextMax];
	TEST_ASSERT_TRUE(formatClockHms(1704153599UL, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("23:59:59", out);
}

void test_format_clock_hms_rolls_over_at_midnight(void) {
	char out[kClockHmsTextMax];
	TEST_ASSERT_TRUE(formatClockHms(1704153600UL, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("00:00:00", out);
}

void test_format_clock_hms_pads_single_digits(void) {
	char out[kClockHmsTextMax];
	TEST_ASSERT_TRUE(formatClockHms(1704070923UL, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("01:02:03", out);
}

void test_format_clock_hms_handles_a_leap_day(void) {
	char out[kClockHmsTextMax];
	TEST_ASSERT_TRUE(formatClockHms(1709210096UL, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("12:34:56", out);
}

void test_format_clock_hms_handles_the_2038_boundary(void) {
	char out[kClockHmsTextMax];
	TEST_ASSERT_TRUE(formatClockHms(2147483648UL, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("03:14:08", out);
}

void test_format_clock_hms_rejects_an_invalid_epoch(void) {
	char out[kClockHmsTextMax] = "garbage";
	TEST_ASSERT_FALSE(formatClockHms(0, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("", out);

	TEST_ASSERT_FALSE(formatClockHms(1704067199UL, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("", out);

	TEST_ASSERT_FALSE(formatClockHms(4102444800UL, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("", out);

	TEST_ASSERT_FALSE(formatClockHms(0xFFFFFFFFUL, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("", out);
}

void test_format_clock_hms_rejects_a_short_buffer(void) {
	char small[8] = "garbage";
	TEST_ASSERT_FALSE(formatClockHms(1704067200UL, small, sizeof(small)));
	TEST_ASSERT_EQUAL_STRING("", small);

	char exact[kClockHmsTextMax];
	TEST_ASSERT_TRUE(formatClockHms(1704067200UL, exact, sizeof(exact)));
	TEST_ASSERT_EQUAL_STRING("00:00:00", exact);
	TEST_ASSERT_EQUAL_UINT32(8, static_cast<uint32_t>(strlen(exact)));
}

void test_format_clock_hms_rejects_null_and_empty_output(void) {
	char out[kClockHmsTextMax] = "garbage";
	TEST_ASSERT_FALSE(formatClockHms(1704067200UL, nullptr, sizeof(out)));
	TEST_ASSERT_FALSE(formatClockHms(1704067200UL, out, 0));
	TEST_ASSERT_EQUAL_STRING("garbage", out);
}

int main(int, char**) {
	UNITY_BEGIN();
	RUN_TEST(test_plausible_epoch_accepts_the_supported_window);
	RUN_TEST(test_plausible_epoch_rejects_unset_and_out_of_range);
	RUN_TEST(test_format_clock_hms_formats_utc_midnight);
	RUN_TEST(test_format_clock_hms_formats_the_end_of_day);
	RUN_TEST(test_format_clock_hms_rolls_over_at_midnight);
	RUN_TEST(test_format_clock_hms_pads_single_digits);
	RUN_TEST(test_format_clock_hms_handles_a_leap_day);
	RUN_TEST(test_format_clock_hms_handles_the_2038_boundary);
	RUN_TEST(test_format_clock_hms_rejects_an_invalid_epoch);
	RUN_TEST(test_format_clock_hms_rejects_a_short_buffer);
	RUN_TEST(test_format_clock_hms_rejects_null_and_empty_output);
	return UNITY_END();
}
