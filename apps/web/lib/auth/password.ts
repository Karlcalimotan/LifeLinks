import "server-only";

import { compare, hash } from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
	return hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, digest: string): Promise<boolean> {
	return compare(plain, digest);
}
