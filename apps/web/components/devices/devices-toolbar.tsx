"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Link } from "@/i18n/routing";
import { type DevicesQuery, hasActiveFilters } from "@/lib/device/query";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	useTransition,
} from "react";

type FilterTransition = {
	pending: boolean;
	run: (callback: () => void) => void;
};

const FilterTransitionContext = createContext<FilterTransition | null>(null);

/**
 * Owns the filter navigation transition so the toolbar and the server-rendered
 * results below it read the same pending flag. Renders no markup.
 */
export function DevicesFilterProvider({ children }: { children: ReactNode }) {
	const [pending, startTransition] = useTransition();
	const value = useMemo<FilterTransition>(() => ({ pending, run: startTransition }), [pending]);

	return (
		<FilterTransitionContext.Provider value={value}>{children}</FilterTransitionContext.Provider>
	);
}

export function DevicesFilterResults({ children }: { children: ReactNode }) {
	const pending = useContext(FilterTransitionContext)?.pending ?? false;

	return (
		<div
			aria-busy={pending || undefined}
			className={cn("transition-opacity", pending && "opacity-60")}
		>
			{children}
		</div>
	);
}

export function DevicesToolbar({ query, total }: { query: DevicesQuery; total: number }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const transition = useContext(FilterTransitionContext);
	const [q, setQ] = useState(query.q);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const activeFilters = [query.approval, query.connection, query.assigned, query.battery].filter(
		Boolean,
	).length;

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
		const href = search ? `${pathname}?${search}` : pathname;
		if (transition) transition.run(() => router.push(href));
		else router.push(href);
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
				className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
				onSubmit={(event) => {
					event.preventDefault();
					const next = new URLSearchParams(searchParams.toString());
					const value = q.trim();
					if (value) next.set("q", value);
					else next.delete("q");
					push(next);
				}}
			>
				<div className="flex items-center gap-2 sm:contents">
					<Input
						id="devices-search"
						value={q}
						onChange={(event) => setQ(event.target.value)}
						placeholder="Search label, MAC or plate"
						aria-label="Search trackers"
						className="h-10 min-w-0 flex-1 sm:w-64 sm:flex-none"
					/>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-10 shrink-0 sm:hidden"
						aria-expanded={filtersOpen}
						aria-controls="devices-filters"
						onClick={() => setFiltersOpen((open) => !open)}
					>
						Filters
						{activeFilters > 0 ? (
							<span className="rounded-full bg-signal-500/15 px-1.5 text-meta tabular-nums text-signal-300">
								{activeFilters}
							</span>
						) : null}
						<ChevronDown
							className={cn("size-4 transition-transform", filtersOpen && "rotate-180")}
							aria-hidden="true"
						/>
					</Button>
				</div>

				<div
					id="devices-filters"
					className={cn("grid grid-cols-2 gap-2 sm:contents", !filtersOpen && "hidden")}
				>
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
					<Button type="submit" size="sm" variant="outline" className="h-11 sm:h-8">
						Search
					</Button>
					<span className="justify-self-end self-center text-xs tabular-nums text-fog-500 sm:ml-auto sm:justify-self-auto">
						{total} tracker{total === 1 ? "" : "s"}
					</span>
				</div>
			</form>
			{hasActiveFilters(query) ? (
				<Link
					href="/devices"
					className="inline-flex h-10 w-fit items-center text-xs text-signal-400 hover:text-signal-300 sm:h-auto"
				>
					Clear filters
				</Link>
			) : null}
		</div>
	);
}
