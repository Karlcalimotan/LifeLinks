import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
	const startedAt = performance.now();
	try {
		await prisma.$queryRaw`SELECT 1`;
		return Response.json({
			status: "ok",
			database: "reachable",
			latencyMs: Math.round(performance.now() - startedAt),
			time: new Date().toISOString(),
		});
	} catch {
		return Response.json(
			{
				status: "degraded",
				database: "unreachable",
				time: new Date().toISOString(),
			},
			{ status: 503 },
		);
	}
}
