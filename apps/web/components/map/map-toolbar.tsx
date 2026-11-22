"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Link, useRouter } from "@/i18n/routing";
import { MAP_FILTERS, type MapFilter, type MapQuery, buildMapHref } from "@/lib/map/query";
import { useEffect, useState } from "react";

export interface MapToolbarLabels {
	searchLabel: string;
	searchPlaceholder: string;
	searchSubmit: string;
	filterLabel: string;
	filters: Record<MapFilter, string>;
}

export function MapToolbar({ query, labels }: { query: MapQuery; labels: MapToolbarLabels }) {
	const router = useRouter();
	const [value, setValue] = useState(query.q);

	useEffect(() => setValue(query.q), [query.q]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
			event.preventDefault();
			document.getElementById("map-search")?.focus();
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		router.push(buildMapHref(query, { q: value.trim(), vehicle: null }));
	}

	return (
		<div className="flex flex-col gap-2.5">
			<form onSubmit={submit} className="flex items-center gap-2">
				<Input
					id="map-search"
					type="search"
					name="q"
					value={value}
					onChange={(event) => setValue(event.target.value)}
					placeholder={labels.searchPlaceholder}
					aria-label={labels.searchLabel}
					className="min-w-0 flex-1"
				/>
				<Button type="submit" variant="outline" className="shrink-0 px-3">
					{labels.searchSubmit}
				</Button>
			</form>

			<fieldset className="flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
				<legend className="sr-only">{labels.filterLabel}</legend>
				{MAP_FILTERS.map((filter) => {
					const active = query.filter === filter;
					return (
						<Link
							key={filter}
							href={buildMapHref(query, { filter, vehicle: null })}
							aria-current={active ? "true" : undefined}
							className={[
								"inline-flex h-8 items-center rounded-control border px-2.5 text-meta font-medium transition-colors",
								active
									? "border-ink-600 bg-ink-700 text-fog-50"
									: "border-ink-700 text-fog-400 hover:border-ink-600 hover:text-fog-100",
							].join(" ")}
						>
							{labels.filters[filter]}
						</Link>
					);
				})}
			</fieldset>
		</div>
	);
}
