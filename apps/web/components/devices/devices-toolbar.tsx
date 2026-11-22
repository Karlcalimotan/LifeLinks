"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Link } from "@/i18n/routing";
import { type DevicesQuery, hasActiveFilters } from "@/lib/device/query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function DevicesToolbar({ query, total }: { query: DevicesQuery; total: number }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [q, setQ] = useState(query.q);

	useEffect(() => setQ(query.q), [query.q]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
			event.preventDefault();
			document.getElementById("devices-search")?.focus();
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	function push(next: URLSearchParams) {
		next.delete("page");
		const search = next.toString();
		router.push(search ? `${pathname}?${search}` : pathname);
	}

	function setParam(key: string, value: string) {
		const next = new URLSearchParams(searchParams.toString());
		if (value) next.set(key, value);
		else next.delete(key);
		push(next);
	}

	return (
		<div className="mb-4 flex flex-col gap-2">
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					const next = new URLSearchParams(searchParams.toString());
					const value = q.trim();
					if (value) next.set("q", value);
					else next.delete("q");
					push(next);
				}}
			>
				<Input
					id="devices-search"
					value={q}
					onChange={(event) => setQ(event.target.value)}
					placeholder="Search label, MAC or plate"
					aria-label="Search trackers"
					className="w-full sm:w-64"
				/>
				<Select
					aria-label="Filter by approval"
					value={query.approval ?? ""}
					onChange={(event) => setParam("approval", event.target.value)}
					className="w-full sm:w-40"
				>
					<option value="">All approvals</option>
					<option value="PENDING">Pending</option>
					<option value="APPROVED">Approved</option>
					<option value="REJECTED">Rejected</option>
				</Select>
				<Select
					aria-label="Filter by connection"
					value={query.connection ?? ""}
					onChange={(event) => setParam("connection", event.target.value)}
					className="w-full sm:w-40"
				>
					<option value="">All connections</option>
					<option value="online">Online</option>
					<option value="weak">Weak signal</option>
					<option value="offline">Offline</option>
					<option value="never">Never seen</option>
				</Select>
				<Select
					aria-label="Filter by vehicle assignment"
					value={query.assigned ?? ""}
					onChange={(event) => setParam("assigned", event.target.value)}
					className="w-full sm:w-40"
				>
					<option value="">Assigned or not</option>
					<option value="yes">Assigned</option>
					<option value="no">Unassigned</option>
				</Select>
				<Select
					aria-label="Filter by battery"
					value={query.battery ?? ""}
					onChange={(event) => setParam("battery", event.target.value)}
					className="w-full sm:w-36"
				>
					<option value="">Any battery</option>
					<option value="low">Low battery</option>
				</Select>
				<Button type="submit" size="sm" variant="outline">
					Search
				</Button>
				<span className="ml-auto text-xs text-fog-500">
					{total} tracker{total === 1 ? "" : "s"}
				</span>
			</form>
			{hasActiveFilters(query) ? (
				<Link href="/devices" className="w-fit text-xs text-signal-400 hover:text-signal-300">
					Clear filters
				</Link>
			) : null}
		</div>
	);
}
