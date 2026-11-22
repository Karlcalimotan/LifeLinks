/**
 * Demo seed target guard.
 *
 * The seed writes a known password for three demo users and real-looking
 * vehicle data. Running it against a shared database is a security incident,
 * not a convenience. Local targets are allowed; anything else needs two
 * independent acknowledgements.
 */

type SeedEnv = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db"]);

/**
 * True only for a URL whose host is a loopback name or the conventional Docker
 * service name. Substring matching is deliberately not used: `localhost.evil.com`
 * is a remote host.
 */
export function isLocalDatabaseUrl(databaseUrl: string | undefined): boolean {
	if (!databaseUrl) return false;

	let hostname: string;
	try {
		hostname = new URL(databaseUrl).hostname.toLowerCase();
	} catch {
		return false;
	}

	const normalized = hostname.replace(/^\[/, "").replace(/\]$/, "");
	return LOCAL_HOSTS.has(normalized);
}

export function assertSeedTarget(env: SeedEnv = process.env): void {
	if (isLocalDatabaseUrl(env.DATABASE_URL)) return;

	if (env.SEED_DEMO !== "yes") {
		throw new Error(
			"Refusing to seed a non-local database. Set SEED_DEMO=yes to acknowledge the target.",
		);
	}
	if (env.SEED_ALLOW_REMOTE !== "yes") {
		throw new Error(
			"Refusing to seed a non-local database. Set SEED_ALLOW_REMOTE=yes as the second acknowledgement, and only for a disposable demo database.",
		);
	}
}
