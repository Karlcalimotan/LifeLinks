import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => new PrismaClient();

declare global {
	var prismaSingleton: PrismaClient | undefined;
}

const prisma = globalThis.prismaSingleton ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prismaSingleton = prisma;
