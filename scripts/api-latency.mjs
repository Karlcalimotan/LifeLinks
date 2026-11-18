#!/usr/bin/env node
/**
 * API regulation latency check (see API_REGULATION.md §8.1 and §11.1).
 *
 *   API_BASE_URL=http://localhost:3000 pnpm api:latency
 *   API_LATENCY_ENDPOINTS=/api/health pnpm api:latency
 *   LATENCY_MODE=fail pnpm api:latency
 *
 * This measures end-to-end HTTP time, so it includes local network overhead.
 * For a server-only number, compare the Server-Timing header. The default
 * target is the health endpoint because it is public; authenticated device
 * routes can be added with API_LATENCY_HEADERS='{"x-device-token":"..."}'.
 */
const baseUrl = (process.env.API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const endpoints = (process.env.API_LATENCY_ENDPOINTS ?? "/api/health")
	.split(",")
	.map((entry) => entry.trim())
	.filter(Boolean);
const headers = process.env.API_LATENCY_HEADERS ? JSON.parse(process.env.API_LATENCY_HEADERS) : {};
const warmup = Number(process.env.LATENCY_WARMUP ?? 5);
const samples = Number(process.env.LATENCY_SAMPLES ?? 30);
const p95Budget = Number(process.env.API_P95_MS ?? 300);
const maxBudget = Number(process.env.API_MAX_MS ?? 400);
const mode = (process.env.LATENCY_MODE ?? "warn").toLowerCase();
const requestTimeoutMs = Number(process.env.API_REQUEST_TIMEOUT_MS ?? 2000);

function percentile(values, pct) {
	const sorted = [...values].sort((a, b) => a - b);
	if (sorted.length === 0) return 0;
	const rank = Math.max(1, Math.ceil((pct / 100) * sorted.length));
	return sorted[Math.min(rank, sorted.length) - 1];
}

async function measure(url) {
	const started = performance.now();
	const response = await fetch(url, {
		headers,
		cache: "no-store",
		signal: AbortSignal.timeout(requestTimeoutMs),
	});
	await response.arrayBuffer();
	return { status: response.status, ms: performance.now() - started };
}

let failed = false;
for (const endpoint of endpoints) {
	const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;
	for (let index = 0; index < warmup; index += 1) {
		await measure(url).catch(() => null);
	}

	const timings = [];
	let serverError = false;
	for (let index = 0; index < samples; index += 1) {
		try {
			const result = await measure(url);
			timings.push(result.ms);
			if (result.status >= 500) serverError = true;
		} catch {
			serverError = true;
		}
	}

	const p95 = percentile(timings, 95);
	const worst = timings.length > 0 ? Math.max(...timings) : 0;
	const problems = [];
	if (serverError) problems.push("server error");
	if (p95 > p95Budget) problems.push(`p95 ${p95.toFixed(1)}ms > ${p95Budget}ms`);
	if (worst > maxBudget) problems.push(`max ${worst.toFixed(1)}ms > ${maxBudget}ms`);

	console.log(
		`${endpoint}: p95=${p95.toFixed(1)}ms max=${worst.toFixed(1)}ms n=${timings.length}${
			problems.length ? ` [${problems.join("; ")}]` : " [ok]"
		}`,
	);
	if (problems.length > 0) {
		if (mode === "fail") failed = true;
		else console.warn(`[warn] ${endpoint}: ${problems.join("; ")}`);
	}
}

if (failed) process.exitCode = 1;
