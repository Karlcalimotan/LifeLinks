import { PrismaClient } from "@prisma/client";

/**
 * Vercel's Supabase integration exposes POSTGRES_* variables, while this app's
 * Prisma schema expects DATABASE_URL (pooled) and DIRECT_URL (session). Alias
 * them before the client is constructed so either naming scheme connects.
 *
 * The NEXT_PUBLIC_SUPABASE_* / SUPABASE_SERVICE_ROLE_KEY values are API keys
 * for Supabase's Data API, not PostgreSQL credentials, and are not used here.
 */
const databaseUrl =
	process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
const directUrl = process.env.DIRECT_URL ?? process.env.POSTGRES_URL_NON_POOLING;

if (databaseUrl && !process.env.DATABASE_URL) process.env.DATABASE_URL = databaseUrl;
if (directUrl && !process.env.DIRECT_URL) process.env.DIRECT_URL = directUrl;

if (!databaseUrl) {
	console.error(
		"[prisma] No database URL. Set DATABASE_URL (pooled) and DIRECT_URL (session) in Vercel, or connect Supabase through the Vercel integration.",
	);
}

const prismaClientSingleton = () => new PrismaClient();

declare global {
	var prismaSingleton: PrismaClient | undefined;
}

const prisma = globalThis.prismaSingleton ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prismaSingleton = prisma;
