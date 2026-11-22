"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Label, Select } from "@/components/ui/field";
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
				className="flex flex-wrap items-end gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					const next = new URLSearchParams(searchParams.toString());
					const value = q.trim();
					if (value) next.set("q", value);
					else next.delete("q");
					push(next);
				}}
			>
				<Field className="w-full sm:w-64">
					<Label htmlFor="devices-search">Search</Label>
					<Input
						id="devices-search"
						value={q}
						onChange={(event) => setQ(event.target.value)}
						placeholder="Label, MAC or plate"
					/>
				</Field>
				<Field className="w-full sm:w-40">
					<Label htmlFor="filter-approval">Approval</Label>
					<Select
						id="filter-approval"
						value={query.approval ?? ""}
						onChange={(event) => setParam("approval", event.target.value)}
					>
						<option value="">All</option>
						<option value="PENDING">Pending</option>
						<option value="APPROVED">Approved</option>
						<option value="REJECTED">Rejected</option>
					</Select>
				</Field>
				<Field className="w-full sm:w-40">
					<Label htmlFor="filter-connection">Connection</Label>
					<Select
						id="filter-connection"
						value={query.connection ?? ""}
						onChange={(event) => setParam("connection", event.target.value)}
					>
						<option value="">All</option>
						<option value="online">Online</option>
						<option value="weak">Weak signal</option>
						<option value="offline">Offline</option>
						<option value="never">Never seen</option>
					</Select>
				</Field>
				<Field className="w-full sm:w-40">
					<Label htmlFor="filter-assigned">Assignment</Label>
					<Select
						id="filter-assigned"
						value={query.assigned ?? ""}
						onChange={(event) => setParam("assigned", event.target.value)}
					>
						<option value="">All</option>
						<option value="yes">Assigned</option>
						<option value="no">Unassigned</option>
					</Select>
				</Field>
				<Field className="w-full sm:w-36">
					<Label htmlFor="filter-battery">Battery</Label>
					<Select
						id="filter-battery"
						value={query.battery ?? ""}
						onChange={(event) => setParam("battery", event.target.value)}
					>
						<option value="">All</option>
						<option value="low">Low</option>
					</Select>
				</Field>
				<Button type="submit" size="sm" variant="outline">
					Apply
				</Button>
				<span className="ml-auto pb-2 text-xs text-fog-500">
					{total} tracker{total === 1 ? "" : "s"}
				</span>
			</form>
			{hasActiveFilters(query) ? (
				<Link href="/devices" className="w-fit text-xs text-fog-300 underline hover:text-fog-100">
					Clear filters
				</Link>
			) : null}
		</div>
	);
}
