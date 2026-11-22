import { describe, expect, it } from "vitest";
import { assertSeedTarget, isLocalDatabaseUrl } from "./guard";

describe("demo seed target guard", () => {
	it("recognizes loopback hosts and the Docker service name", () => {
		expect(isLocalDatabaseUrl("postgresql://u:p@localhost:5432/lifelink")).toBe(true);
		expect(isLocalDatabaseUrl("postgresql://u:p@127.0.0.1:5432/lifelink")).toBe(true);
		expect(isLocalDatabaseUrl("postgresql://u:p@[::1]:5432/lifelink")).toBe(true);
		expect(isLocalDatabaseUrl("postgresql://u:p@db:5432/lifelink")).toBe(true);
	});

	it("does not accept a hostname that merely contains a local name", () => {
		expect(isLocalDatabaseUrl("postgresql://u:p@localhost.evil.example:5432/lifelink")).toBe(false);
		expect(isLocalDatabaseUrl("postgresql://u:p@db.example.com:5432/lifelink")).toBe(false);
		expect(isLocalDatabaseUrl("not a database url")).toBe(false);
		expect(isLocalDatabaseUrl(undefined)).toBe(false);
	});

	it("allows the local seed path without acknowledgement flags", () => {
		expect(() =>
			assertSeedTarget({ DATABASE_URL: "postgresql://u:p@localhost:5432/lifelink" }),
		).not.toThrow();
	});

	it("requires SEED_DEMO for a remote target", () => {
		expect(() =>
			assertSeedTarget({ DATABASE_URL: "postgresql://u:p@db.example.com:5432/lifelink" }),
		).toThrow(/SEED_DEMO=yes/);
	});

	it("requires the second remote acknowledgement", () => {
		expect(() =>
			assertSeedTarget({
				DATABASE_URL: "postgresql://u:p@db.example.com:5432/lifelink",
				SEED_DEMO: "yes",
			}),
		).toThrow(/SEED_ALLOW_REMOTE=yes/);
	});

	it("allows an explicitly acknowledged disposable remote demo database", () => {
		expect(() =>
			assertSeedTarget({
				DATABASE_URL: "postgresql://u:p@db.example.com:5432/lifelink",
				SEED_DEMO: "yes",
				SEED_ALLOW_REMOTE: "yes",
			}),
		).not.toThrow();
	});

	it("fails closed when the database URL is absent", () => {
		expect(() => assertSeedTarget({})).toThrow(/Refusing to seed a non-local database/);
	});
});
