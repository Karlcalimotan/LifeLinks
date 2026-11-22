/*
  Native tests for the WiFi provisioning rules and the boot reset gesture.

  Run with: pio test -d firmware -e native
*/
#include <unity.h>

#include <string.h>

#include "../../main/provisioning.h"

using namespace fw;

void setUp(void) {}

void tearDown(void) {}

static int actionOf(BootResetAction action) { return static_cast<int>(action); }

void test_ap_name_uses_last_four_hex_digits(void) {
	char name[kProvisioningApNameMax];
	TEST_ASSERT_TRUE(provisioningApName("AA:BB:CC:DD:EE:FF", name, sizeof(name)));
	TEST_ASSERT_EQUAL_STRING("LifeLink-EEFF", name);
}

void test_ap_name_uppercases_and_zero_pads(void) {
	char name[kProvisioningApNameMax];
	TEST_ASSERT_TRUE(provisioningApName("aa:bb:cc:dd:ee:0f", name, sizeof(name)));
	TEST_ASSERT_EQUAL_STRING("LifeLink-EE0F", name);
	TEST_ASSERT_TRUE(provisioningApName("AB", name, sizeof(name)));
	TEST_ASSERT_EQUAL_STRING("LifeLink-00AB", name);
	TEST_ASSERT_TRUE(provisioningApName("", name, sizeof(name)));
	TEST_ASSERT_EQUAL_STRING("LifeLink-0000", name);
}

void test_ap_name_rejects_a_short_buffer(void) {
	char name[kProvisioningApNameMax];
	TEST_ASSERT_FALSE(provisioningApName("AA:BB:CC:DD:EE:FF", name, sizeof(name) - 1));
	TEST_ASSERT_FALSE(provisioningApName("AA:BB:CC:DD:EE:FF", nullptr, sizeof(name)));
}

void test_form_accepts_a_usable_submission(void) {
	TEST_ASSERT_EQUAL_INT(static_cast<int>(ProvisioningField::None),
						  static_cast<int>(validateProvisioningForm(
							  "HomeNet", "correct horse", "AA:BB:CC:DD:EE:01", "llk_12345678")));
}

void test_form_accepts_an_open_network(void) {
	TEST_ASSERT_EQUAL_INT(static_cast<int>(ProvisioningField::None),
						  static_cast<int>(validateProvisioningForm(
							  "OpenNet", "", "AA:BB:CC:DD:EE:01", "llk_12345678")));
}

void test_ssid_limits(void) {
	char ssid[34];
	memset(ssid, 'a', sizeof(ssid));
	ssid[32] = '\0';
	TEST_ASSERT_TRUE(isValidStoredSsid(ssid));
	ssid[32] = 'b';
	ssid[33] = '\0';
	TEST_ASSERT_FALSE(isValidStoredSsid(ssid));
	TEST_ASSERT_FALSE(isValidStoredSsid(""));
	TEST_ASSERT_FALSE(isValidStoredSsid(nullptr));
}

void test_password_limits(void) {
	TEST_ASSERT_TRUE(isValidStoredPassword(""));
	TEST_ASSERT_TRUE(isValidStoredPassword("12345678"));
	TEST_ASSERT_TRUE(
		isValidStoredPassword("123456789012345678901234567890123456789012345678901234567890123"));
	TEST_ASSERT_FALSE(isValidStoredPassword("1234567"));
	TEST_ASSERT_FALSE(
		isValidStoredPassword("1234567890123456789012345678901234567890123456789012345678901234"));
	TEST_ASSERT_FALSE(isValidStoredPassword(nullptr));
}

void test_token_limits(void) {
	char token[130];
	memset(token, 't', sizeof(token));
	token[128] = '\0';
	TEST_ASSERT_TRUE(isValidStoredToken(token));
	TEST_ASSERT_TRUE(isValidStoredToken("12345678"));
	TEST_ASSERT_FALSE(isValidStoredToken("1234567"));
	token[128] = 'x';
	token[129] = '\0';
	TEST_ASSERT_FALSE(isValidStoredToken(token));
	TEST_ASSERT_FALSE(isValidStoredToken(nullptr));
}

void test_device_id_limits(void) {
	TEST_ASSERT_TRUE(isValidStoredDeviceId("AA:BB:CC:DD:EE:01"));
	TEST_ASSERT_FALSE(isValidStoredDeviceId(""));
	TEST_ASSERT_FALSE(isValidStoredDeviceId(nullptr));
}

void test_form_rejects_each_invalid_field(void) {
	TEST_ASSERT_EQUAL_INT(static_cast<int>(ProvisioningField::Ssid),
						  static_cast<int>(validateProvisioningForm(
							  "", "password1", "AA:BB:CC:DD:EE:01", "llk_12345678")));
	TEST_ASSERT_EQUAL_INT(static_cast<int>(ProvisioningField::Password),
						  static_cast<int>(validateProvisioningForm(
							  "HomeNet", "short", "AA:BB:CC:DD:EE:01", "llk_12345678")));
	TEST_ASSERT_EQUAL_INT(
		static_cast<int>(ProvisioningField::DeviceId),
		static_cast<int>(validateProvisioningForm("HomeNet", "password1", "", "llk_12345678")));
	TEST_ASSERT_EQUAL_INT(static_cast<int>(ProvisioningField::Token),
						  static_cast<int>(validateProvisioningForm("HomeNet", "password1",
																	"AA:BB:CC:DD:EE:01", "short")));
}

void test_provisioning_requires_every_stored_value(void) {
	TEST_ASSERT_TRUE(
		isProvisioningComplete(true, "HomeNet", "password1", "AA:BB:CC:DD:EE:01", "llk_12345678"));
	TEST_ASSERT_TRUE(
		isProvisioningComplete(true, "OpenNet", "", "AA:BB:CC:DD:EE:01", "llk_12345678"));
	TEST_ASSERT_FALSE(
		isProvisioningComplete(false, "HomeNet", "password1", "AA:BB:CC:DD:EE:01", "llk_12345678"));
	TEST_ASSERT_FALSE(
		isProvisioningComplete(true, "", "password1", "AA:BB:CC:DD:EE:01", "llk_12345678"));
	TEST_ASSERT_FALSE(
		isProvisioningComplete(true, "HomeNet", "1234567", "AA:BB:CC:DD:EE:01", "llk_12345678"));
	TEST_ASSERT_FALSE(isProvisioningComplete(true, "HomeNet", "password1", "", "llk_12345678"));
	TEST_ASSERT_FALSE(
		isProvisioningComplete(true, "HomeNet", "password1", "AA:BB:CC:DD:EE:01", ""));
}

void test_reset_does_not_arm_before_the_startup_grace(void) {
	BootResetSequence reset;
	reset.begin(0);
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(100, false)));
	TEST_ASSERT_FALSE(reset.armed());
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(4999, false)));
	TEST_ASSERT_FALSE(reset.armed());
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(5050, false)));
	TEST_ASSERT_TRUE(reset.armed());
}

void test_stuck_button_never_resets(void) {
	BootResetSequence reset;
	reset.begin(0);
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(0, true)));
	for (uint32_t nowMs = 50; nowMs <= 60000; nowMs += 50) {
		TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(nowMs, true)));
	}
	TEST_ASSERT_FALSE(reset.armed());
	TEST_ASSERT_FALSE(reset.restartPending());
}

void test_released_button_arms_then_holds(void) {
	BootResetSequence reset;
	reset.begin(0);
	// Held from power-on: this must not arm.
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(1000, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(1200, true)));
	// Release, then wait for the grace and the debounce.
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(2000, false)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(5100, false)));
	TEST_ASSERT_TRUE(reset.armed());
}

void test_five_second_hold_clears_wifi_and_restarts_on_release(void) {
	BootResetSequence reset;
	reset.begin(0);
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(5100, false)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6000, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6050, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(10999, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::ClearWifi),
						  actionOf(reset.update(11000, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(11050, true)));
	TEST_ASSERT_FALSE(reset.restartPending());
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(11500, false)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(11550, false)));
	TEST_ASSERT_TRUE(reset.restartPending());
}

void test_ten_second_hold_clears_everything(void) {
	BootResetSequence reset;
	reset.begin(0);
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(5100, false)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6000, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6050, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::ClearWifi),
						  actionOf(reset.update(11000, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::ClearAll), actionOf(reset.update(16000, true)));
	TEST_ASSERT_TRUE(reset.restartPending());
	TEST_ASSERT_FALSE(reset.active());
}

void test_short_glitch_is_ignored(void) {
	BootResetSequence reset;
	reset.begin(0);
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(5100, false)));
	// 40 ms glitch, shorter than the 50 ms debounce.
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6000, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6040, false)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6090, false)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(12000, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(12050, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(12400, true)));
	TEST_ASSERT_FALSE(reset.restartPending());
}

void test_no_new_hold_after_the_boot_window(void) {
	BootResetSequence reset;
	reset.begin(0);
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(5100, false)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(60000, false)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(60100, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(60500, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(66000, true)));
	TEST_ASSERT_FALSE(reset.restartPending());
}

void test_a_press_after_an_unsampled_window_is_rejected(void) {
	BootResetSequence reset;
	reset.begin(0);
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(5100, false)));
	// Jump straight past the window and press: no update with the button
	// released at 60 s, so the state machine must reject the hold itself.
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(60100, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(60150, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(65150, true)));
	TEST_ASSERT_FALSE(reset.restartPending());
}

void test_disable_stops_the_gesture(void) {
	BootResetSequence reset;
	reset.begin(0);
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(5100, false)));
	reset.disable();
	TEST_ASSERT_FALSE(reset.active());
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6000, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6050, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(16000, true)));
	TEST_ASSERT_FALSE(reset.restartPending());
}

void test_abort_drops_a_pending_restart(void) {
	BootResetSequence reset;
	reset.begin(0);
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(5100, false)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6000, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(6050, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::ClearWifi),
						  actionOf(reset.update(11000, true)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(11500, false)));
	TEST_ASSERT_EQUAL_INT(actionOf(BootResetAction::None), actionOf(reset.update(11550, false)));
	TEST_ASSERT_TRUE(reset.restartPending());
	reset.abort();
	TEST_ASSERT_FALSE(reset.restartPending());
	TEST_ASSERT_FALSE(reset.active());
}

int main(int, char**) {
	UNITY_BEGIN();
	RUN_TEST(test_ap_name_uses_last_four_hex_digits);
	RUN_TEST(test_ap_name_uppercases_and_zero_pads);
	RUN_TEST(test_ap_name_rejects_a_short_buffer);
	RUN_TEST(test_form_accepts_a_usable_submission);
	RUN_TEST(test_form_accepts_an_open_network);
	RUN_TEST(test_ssid_limits);
	RUN_TEST(test_password_limits);
	RUN_TEST(test_token_limits);
	RUN_TEST(test_device_id_limits);
	RUN_TEST(test_form_rejects_each_invalid_field);
	RUN_TEST(test_provisioning_requires_every_stored_value);
	RUN_TEST(test_reset_does_not_arm_before_the_startup_grace);
	RUN_TEST(test_stuck_button_never_resets);
	RUN_TEST(test_released_button_arms_then_holds);
	RUN_TEST(test_five_second_hold_clears_wifi_and_restarts_on_release);
	RUN_TEST(test_ten_second_hold_clears_everything);
	RUN_TEST(test_short_glitch_is_ignored);
	RUN_TEST(test_no_new_hold_after_the_boot_window);
	RUN_TEST(test_a_press_after_an_unsampled_window_is_rejected);
	RUN_TEST(test_disable_stops_the_gesture);
	RUN_TEST(test_abort_drops_a_pending_restart);
	return UNITY_END();
}
