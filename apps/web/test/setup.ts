import "@testing-library/jest-dom/vitest";
import { resetRateLimitsForTests } from "@/lib/rate-limit";
import { beforeEach } from "vitest";

beforeEach(() => {
	resetRateLimitsForTests();
});
