/*
  Native tests for the SSD1306 screen text.

  Run with: pio test -d firmware -e native

  The device token has no representation in display_format.h by design, so
  there is nothing token-shaped these tests could assert on.
*/
#include <unity.h>

#include <string.h>

#include "../../main/display_format.h"

using namespace fw;

void setUp(void) {}

void tearDown(void) {}

static bool screenContains(const DisplayScreen& screen, const char* text) {
	for (uint8_t row = 0; row < screen.lineCount; row += 1) {
		if (strstr(screen.lines[row], text) != nullptr) return true;
	}
	return false;
}

static void assertScreenFits(const DisplayScreen& screen) {
	TEST_ASSERT_TRUE(screen.lineCount <= kDisplayRows);
	for (uint8_t row = 0; row < screen.lineCount; row += 1) {
		TEST_ASSERT_TRUE(strlen(screen.lines[row]) <= kDisplayColumns);
	}
}

void test_ipv4_formats_all_octets(void) {
	char out[kIpv4TextMax];
	TEST_ASSERT_TRUE(formatIpv4(192, 168, 4, 1, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("192.168.4.1", out);
	TEST_ASSERT_TRUE(formatIpv4(0, 0, 0, 0, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("0.0.0.0", out);
	TEST_ASSERT_TRUE(formatIpv4(255, 255, 255, 255, out, sizeof(out)));
	TEST_ASSERT_EQUAL_STRING("255.255.255.255", out);
}

void test_ipv4_rejects_a_short_buffer(void) {
	char small[15];
	TEST_ASSERT_FALSE(formatIpv4(255, 255, 255, 255, small, sizeof(small)));
	TEST_ASSERT_EQUAL_STRING("", small);
	TEST_ASSERT_FALSE(formatIpv4(1, 2, 3, 4, nullptr, kIpv4TextMax));
	TEST_ASSERT_FALSE(formatIpv4(1, 2, 3, 4, small, 0));
}

void test_copy_display_text_sanitises_and_truncates(void) {
	char out[8];
	TEST_ASSERT_EQUAL_UINT32(
		5, static_cast<uint32_t>(copyDisplayText("ab\xC3\xA9z", out, sizeof(out), 6)));
	TEST_ASSERT_EQUAL_STRING("ab??z", out);
	TEST_ASSERT_EQUAL_UINT32(3, static_cast<uint32_t>(copyDisplayText("abcdef", out, 4, 10)));
	TEST_ASSERT_EQUAL_STRING("abc", out);
	TEST_ASSERT_EQUAL_UINT32(0,
							 static_cast<uint32_t>(copyDisplayText(nullptr, out, sizeof(out), 6)));
	TEST_ASSERT_EQUAL_STRING("", out);
	TEST_ASSERT_EQUAL_UINT32(0, static_cast<uint32_t>(copyDisplayText("abc", nullptr, 4, 3)));
	TEST_ASSERT_EQUAL_UINT32(0, static_cast<uint32_t>(copyDisplayText("abc", out, 0, 3)));
}

void test_progress_dots_cycle(void) {
	TEST_ASSERT_EQUAL_UINT32(0, static_cast<uint32_t>(progressDots(0)));
	TEST_ASSERT_EQUAL_UINT32(1, static_cast<uint32_t>(progressDots(1)));
	TEST_ASSERT_EQUAL_UINT32(2, static_cast<uint32_t>(progressDots(2)));
	TEST_ASSERT_EQUAL_UINT32(3, static_cast<uint32_t>(progressDots(3)));
	TEST_ASSERT_EQUAL_UINT32(0, static_cast<uint32_t>(progressDots(4)));
	TEST_ASSERT_EQUAL_UINT32(2, static_cast<uint32_t>(progressDots(1000002)));
}

void test_draw_gate_ignores_unchanged_content(void) {
	DrawGate gate;
	TEST_ASSERT_FALSE(gate.shouldDraw(0, false));
	TEST_ASSERT_FALSE(gate.shouldDraw(1000, false));
	gate.markDrawn(1000);
	TEST_ASSERT_FALSE(gate.shouldDraw(2000, false));
}

void test_draw_gate_draws_the_first_change_immediately(void) {
	DrawGate gate;
	TEST_ASSERT_FALSE(gate.hasDrawn());
	TEST_ASSERT_TRUE(gate.shouldDraw(0, true));
	gate.markDrawn(0);
	TEST_ASSERT_TRUE(gate.hasDrawn());
	TEST_ASSERT_FALSE(gate.shouldDraw(0, true));
	TEST_ASSERT_FALSE(gate.shouldDraw(kDisplayMinDrawGapMs - 1, true));
	TEST_ASSERT_TRUE(gate.shouldDraw(kDisplayMinDrawGapMs, true));
}

void test_draw_gate_waits_for_the_gap_after_a_draw(void) {
	DrawGate gate;
	gate.markDrawn(1000);
	TEST_ASSERT_FALSE(gate.shouldDraw(1200, true));
	TEST_ASSERT_TRUE(gate.shouldDraw(1250, true));
	gate.markDrawn(1250);
	TEST_ASSERT_FALSE(gate.shouldDraw(1300, true));
	TEST_ASSERT_TRUE(gate.shouldDraw(1500, true));
}

void test_draw_gate_handles_the_millis_wrap(void) {
	DrawGate gate;
	gate.markDrawn(0xFFFFFFF0u);
	TEST_ASSERT_FALSE(gate.shouldDraw(0x00000010u, true));	// 32 ms elapsed
	TEST_ASSERT_TRUE(gate.shouldDraw(0x000000F0u, true));  // 256 ms elapsed
}

void test_wifi_state_labels_are_not_online(void) {
	const DisplayWifiState states[] = {DisplayWifiState::Setup, DisplayWifiState::Joining,
									   DisplayWifiState::Joined};
	const char* expected[] = {"WiFi: setup", "WiFi: joining", "WiFi: joined"};
	for (size_t index = 0; index < 3; index += 1) {
		const char* label = wifiStateLabel(states[index]);
		TEST_ASSERT_EQUAL_STRING(expected[index], label);
		TEST_ASSERT_NULL(strstr(label, "online"));
		TEST_ASSERT_NULL(strstr(label, "Online"));
		TEST_ASSERT_NULL(strstr(label, "ONLINE"));
	}
}

void test_provisioning_screen_uses_the_mac_derived_ap_name(void) {
	const DisplayScreen screen = provisioningScreenForMac("AA:BB:CC:DD:EE:FF");
	TEST_ASSERT_EQUAL_UINT8(4, screen.lineCount);
	TEST_ASSERT_EQUAL_STRING("WiFi setup", screen.lines[0]);
	TEST_ASSERT_TRUE(screenContains(screen, "LifeLink-EEFF"));
	TEST_ASSERT_TRUE(screenContains(screen, "Open 192.168.4.1"));
	assertScreenFits(screen);

	const DisplayScreen fallback = provisioningScreen(nullptr);
	TEST_ASSERT_TRUE(screenContains(fallback, "LifeLink-0000"));
}

void test_joining_screen_shows_ssid_and_progress(void) {
	DisplayScreen screen = joiningScreen("HomeNet", 0, 0, 0);
	TEST_ASSERT_EQUAL_UINT8(3, screen.lineCount);
	TEST_ASSERT_EQUAL_STRING("HomeNet", screen.lines[1]);
	TEST_ASSERT_EQUAL_STRING("Working", screen.lines[2]);

	screen = joiningScreen("HomeNet", 2, 0, 0);
	TEST_ASSERT_EQUAL_STRING("Working..", screen.lines[2]);

	screen = joiningScreen("HomeNet", 4, 0, 0);
	TEST_ASSERT_EQUAL_STRING("Working", screen.lines[2]);
	assertScreenFits(screen);
}

void test_joining_screen_shows_the_attempt(void) {
	const DisplayScreen screen = joiningScreen("HomeNet", 1, 2, 3);
	TEST_ASSERT_EQUAL_UINT8(4, screen.lineCount);
	TEST_ASSERT_EQUAL_STRING("Try 2 of 3", screen.lines[3]);
}

void test_joining_screen_handles_an_empty_ssid(void) {
	const DisplayScreen screen = joiningScreen("", 0, 0, 0);
	TEST_ASSERT_EQUAL_STRING("(no network)", screen.lines[1]);
	const DisplayScreen nullScreen = joiningScreen(nullptr, 0, 0, 0);
	TEST_ASSERT_EQUAL_STRING("(no network)", nullScreen.lines[1]);
}

void test_joining_screen_truncates_a_long_ssid(void) {
	char ssid[kSsidMaxLength + 1];
	memset(ssid, 'n', sizeof(ssid));
	ssid[kSsidMaxLength] = '\0';
	const DisplayScreen screen = joiningScreen(ssid, 0, 0, 0);
	TEST_ASSERT_EQUAL_UINT32(static_cast<uint32_t>(kDisplayColumns),
							 static_cast<uint32_t>(strlen(screen.lines[1])));
	assertScreenFits(screen);
}

void test_wifi_ok_screen_shows_ssid_and_ip(void) {
	const DisplayScreen screen = wifiOkScreen("HomeNet", "192.168.4.2");
	TEST_ASSERT_EQUAL_UINT8(4, screen.lineCount);
	TEST_ASSERT_EQUAL_STRING("WiFi OK - saved", screen.lines[0]);
	TEST_ASSERT_EQUAL_STRING("HomeNet", screen.lines[1]);
	TEST_ASSERT_EQUAL_STRING("IP 192.168.4.2", screen.lines[2]);
	TEST_ASSERT_EQUAL_STRING("Uplink: 4G modem", screen.lines[3]);
	assertScreenFits(screen);

	const DisplayScreen empty = wifiOkScreen("", "");
	TEST_ASSERT_EQUAL_STRING("(saved)", empty.lines[1]);
	TEST_ASSERT_EQUAL_STRING("IP -", empty.lines[2]);
}

void test_home_screen_shows_state_and_device_id(void) {
	const DisplayScreen screen = homeScreen(DisplayWifiState::Joined, "AA:BB:CC:DD:EE:01", "");
	TEST_ASSERT_EQUAL_UINT8(5, screen.lineCount);
	TEST_ASSERT_EQUAL_STRING("LifeLink tracker", screen.lines[0]);
	TEST_ASSERT_EQUAL_STRING("WiFi: joined", screen.lines[1]);
	TEST_ASSERT_EQUAL_STRING("Uplink: 4G modem", screen.lines[2]);
	TEST_ASSERT_EQUAL_STRING("Device ID", screen.lines[3]);
	TEST_ASSERT_EQUAL_STRING("AA:BB:CC:DD:EE:01", screen.lines[4]);
	TEST_ASSERT_FALSE(screenContains(screen, "UUID"));
	TEST_ASSERT_NULL(strstr(screen.lines[1], "online"));
	assertScreenFits(screen);

	const DisplayScreen setup = homeScreen(DisplayWifiState::Setup, "AA:BB:CC:DD:EE:01", nullptr);
	TEST_ASSERT_EQUAL_STRING("WiFi: setup", setup.lines[1]);
	const DisplayScreen joining =
		homeScreen(DisplayWifiState::Joining, "AA:BB:CC:DD:EE:01", nullptr);
	TEST_ASSERT_EQUAL_STRING("WiFi: joining", joining.lines[1]);
}

void test_home_screen_adds_uuid_only_when_present(void) {
	const DisplayScreen withUuid = homeScreen(DisplayWifiState::Joined, "AA:BB:CC:DD:EE:01",
											  "123e4567-e89b-12d3-a456-426614174000");
	TEST_ASSERT_EQUAL_UINT8(7, withUuid.lineCount);
	TEST_ASSERT_EQUAL_STRING("UUID", withUuid.lines[5]);
	TEST_ASSERT_EQUAL_UINT32(static_cast<uint32_t>(kDisplayColumns),
							 static_cast<uint32_t>(strlen(withUuid.lines[6])));
	TEST_ASSERT_EQUAL_STRING_LEN("123e4567-e89b-12d3-a4", withUuid.lines[6], kDisplayColumns);
	assertScreenFits(withUuid);

	const DisplayScreen withoutUuid =
		homeScreen(DisplayWifiState::Joined, "AA:BB:CC:DD:EE:01", nullptr);
	TEST_ASSERT_EQUAL_UINT8(5, withoutUuid.lineCount);
	const DisplayScreen emptyUuid = homeScreen(DisplayWifiState::Joined, "AA:BB:CC:DD:EE:01", "");
	TEST_ASSERT_EQUAL_UINT8(5, emptyUuid.lineCount);
}

void test_home_screen_sanitises_non_ascii(void) {
	const DisplayScreen screen = homeScreen(DisplayWifiState::Setup, "AA:BB:\xC3\xA9\x01", nullptr);
	TEST_ASSERT_TRUE(screenContains(screen, "AA:BB:???"));
	assertScreenFits(screen);
}

void test_every_screen_fits_the_panel(void) {
	char longText[64];
	memset(longText, 'x', sizeof(longText) - 1);
	longText[sizeof(longText) - 1] = '\0';
	const DisplayScreen screens[] = {
		provisioningScreenForMac("AA:BB:CC:DD:EE:FF"),
		joiningScreen(longText, 1, 2, 3),
		wifiOkScreen(longText, "255.255.255.255"),
		homeScreen(DisplayWifiState::Joined, longText, longText),
	};
	for (const DisplayScreen& screen : screens) assertScreenFits(screen);
}

int main(int, char**) {
	UNITY_BEGIN();
	RUN_TEST(test_ipv4_formats_all_octets);
	RUN_TEST(test_ipv4_rejects_a_short_buffer);
	RUN_TEST(test_copy_display_text_sanitises_and_truncates);
	RUN_TEST(test_progress_dots_cycle);
	RUN_TEST(test_draw_gate_ignores_unchanged_content);
	RUN_TEST(test_draw_gate_draws_the_first_change_immediately);
	RUN_TEST(test_draw_gate_waits_for_the_gap_after_a_draw);
	RUN_TEST(test_draw_gate_handles_the_millis_wrap);
	RUN_TEST(test_wifi_state_labels_are_not_online);
	RUN_TEST(test_provisioning_screen_uses_the_mac_derived_ap_name);
	RUN_TEST(test_joining_screen_shows_ssid_and_progress);
	RUN_TEST(test_joining_screen_shows_the_attempt);
	RUN_TEST(test_joining_screen_handles_an_empty_ssid);
	RUN_TEST(test_joining_screen_truncates_a_long_ssid);
	RUN_TEST(test_wifi_ok_screen_shows_ssid_and_ip);
	RUN_TEST(test_home_screen_shows_state_and_device_id);
	RUN_TEST(test_home_screen_adds_uuid_only_when_present);
	RUN_TEST(test_home_screen_sanitises_non_ascii);
	RUN_TEST(test_every_screen_fits_the_panel);
	return UNITY_END();
}
