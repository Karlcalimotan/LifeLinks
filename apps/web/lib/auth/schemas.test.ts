import { describe, expect, it } from "vitest";
import { loginSchema } from "./schemas";

describe("login schema", () => {
	it("normalizes the email and accepts a 128 character password", () => {
		const result = loginSchema.safeParse({
			email: "  ADMIN@LifeLink.local ",
			password: "x".repeat(128),
		});
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.email).toBe("admin@lifelink.local");
	});

	it("rejects a password longer than 128 characters before bcrypt", () => {
		const result = loginSchema.safeParse({
			email: "admin@lifelink.local",
			password: "x".repeat(129),
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]?.message).toBe("Password must be at most 128 characters.");
	});

	it("still requires a password", () => {
		expect(loginSchema.safeParse({ email: "admin@lifelink.local", password: "" }).success).toBe(
			false,
		);
	});
});
