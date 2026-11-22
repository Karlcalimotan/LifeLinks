"use client";

import { ApprovalBadge, IncidentStatusBadge } from "@/components/domain/badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/i18n/routing";
import { type MemberRoleName, canAdminister } from "@/lib/auth/roles";
import { isTypingTarget, nextActiveIndex } from "@/lib/search/keyboard";
import { type PageCandidate, SEARCH_PAGES, matchPages, visiblePages } from "@/lib/search/pages";
import { SEARCH_RESULT_LIMIT, parseSearchQuery } from "@/lib/search/query";
import { type SearchResult, parseSearchResults } from "@/lib/search/shape";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";
import {
	Car,
	ChevronRight,
	LayoutDashboard,
	type LucideIcon,
	Radio,
	Search,
	Settings,
	TriangleAlert,
	X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const RESULT_TYPES = {
	page: "typePage",
	vehicle: "typeVehicle",
	incident: "typeIncident",
	device: "typeDevice",
} as const;

const pageIcons: Record<PageCandidate["key"], LucideIcon> = {
	dashboard: LayoutDashboard,
	vehicles: Car,
	incidents: TriangleAlert,
	devices: Radio,
	settings: Settings,
};

export function CommandPalette({ role }: { role: MemberRoleName }) {
	const t = useTranslations("search");
	const nav = useTranslations("nav");
	const locale = useLocale();
	const router = useRouter();

	const [open, setOpen] = useState(false);
	const [mounted, setMounted] = useState(false);
	const [query, setQuery] = useState("");
	const [remote, setRemote] = useState<SearchResult[]>([]);
	const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
	const [active, setActive] = useState(0);
	const [retryNonce, setRetryNonce] = useState(0);

	const triggerRef = useRef<HTMLButtonElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		const onWindowKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen(true);
				inputRef.current?.focus();
				return;
			}
			if (
				event.key === "/" &&
				!open &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				!isTypingTarget(event.target)
			) {
				event.preventDefault();
				setOpen(true);
			}
		};
		window.addEventListener("keydown", onWindowKeyDown);
		return () => window.removeEventListener("keydown", onWindowKeyDown);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			window.cancelAnimationFrame(frame);
			document.body.style.overflow = previousOverflow;
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const trimmed = parseSearchQuery(query);
		if (!trimmed) {
			setRemote([]);
			setStatus("idle");
			return;
		}

		setStatus("loading");
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			fetch(`/api/search?q=${encodeURIComponent(trimmed)}&retry=${retryNonce}`, {
				signal: controller.signal,
				cache: "no-store",
				headers: { accept: "application/json" },
			})
				.then(async (response) => {
					if (!response.ok) throw new Error(`Search failed with ${response.status}`);
					const payload = (await response.json()) as { data?: { results?: unknown } };
					setRemote(parseSearchResults(payload.data?.results));
					setStatus("ready");
				})
				.catch(() => {
					if (controller.signal.aborted) return;
					setRemote([]);
					setStatus("error");
				});
		}, 180);

		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [open, query, retryNonce]);

	const pages: PageCandidate[] = visiblePages(SEARCH_PAGES, canAdminister(role)).map((page) => ({
		...page,
		label: nav(page.key),
	}));
	const pageResults: SearchResult[] = matchPages(pages, query).map((page) => ({
		type: "page",
		id: `page-${page.key}`,
		title: page.label,
		subtitle: null,
		meta: null,
		href: page.href,
		status: null,
		timestamp: null,
	}));
	const results = [...pageResults, ...remote].slice(0, SEARCH_RESULT_LIMIT);
	const hasQuery = parseSearchQuery(query).length > 0;
	const showList = status !== "loading" && status !== "error" && results.length > 0;
	const activeIndex = results.length === 0 ? -1 : Math.min(Math.max(active, 0), results.length - 1);
	const activeResult = showList && activeIndex >= 0 ? results[activeIndex] : undefined;

	useEffect(() => {
		if (!open || activeIndex < 0) return;
		const element = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
		element?.scrollIntoView({ block: "nearest" });
	}, [open, activeIndex]);

	function close() {
		setOpen(false);
		setQuery("");
		setRemote([]);
		setStatus("idle");
		setActive(0);
		triggerRef.current?.focus();
	}

	function go(result: SearchResult) {
		close();
		router.push(result.href);
	}

	function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
		if (event.key !== "Tab") return;
		const dialog = dialogRef.current;
		if (!dialog) return;
		const focusable = Array.from(
			dialog.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		);
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function onDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
		if (event.key === "Escape") {
			event.preventDefault();
			close();
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActive(nextActiveIndex(activeIndex, 1, results.length));
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setActive(nextActiveIndex(activeIndex, -1, results.length));
			return;
		}
		if (event.key === "Home") {
			event.preventDefault();
			setActive(0);
			return;
		}
		if (event.key === "End") {
			event.preventDefault();
			setActive(results.length - 1);
			return;
		}
		if (event.key === "Enter" && activeResult) {
			const target = event.target as HTMLElement;
			const fromOption = target.dataset.searchOption === "true";
			if (document.activeElement === inputRef.current || fromOption) {
				event.preventDefault();
				go(activeResult);
			}
			return;
		}
		trapFocus(event);
	}

	function ResultIcon({ result }: { result: SearchResult }) {
		if (result.type === "page") {
			const key = result.id.replace("page-", "") as PageCandidate["key"];
			const Icon = pageIcons[key] ?? ChevronRight;
			return <Icon className="size-4" aria-hidden="true" />;
		}
		if (result.type === "vehicle") return <Car className="size-4" aria-hidden="true" />;
		if (result.type === "incident") {
			return <TriangleAlert className="size-4" aria-hidden="true" />;
		}
		return <Radio className="size-4" aria-hidden="true" />;
	}

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen(true)}
				aria-label={t("openAria")}
				aria-haspopup="dialog"
				aria-keyshortcuts="Control+K Meta+K"
				className="inline-flex h-8 items-center gap-1.5 rounded-control border border-ink-600 bg-ink-800 px-2 text-meta text-fog-300 transition-colors hover:bg-ink-700 hover:text-fog-100"
			>
				<Search className="size-4" aria-hidden="true" />
				<span className="hidden md:inline">{t("open")}</span>
				<kbd className="hidden rounded-control border border-ink-600 px-1 font-mono text-meta text-fog-500 lg:inline">
					{t("shortcut")}
				</kbd>
			</button>

			{mounted && open
				? createPortal(
						<dialog
							open
							ref={dialogRef}
							aria-modal="true"
							aria-labelledby="command-palette-title"
							onKeyDown={onDialogKeyDown}
							onMouseDown={(event) => {
								if (event.target === event.currentTarget) close();
							}}
							className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-stretch justify-center border-0 bg-ink-950/80 p-0 text-fog-100 sm:items-center sm:p-6"
						>
							<div className="flex h-full w-full flex-col overflow-hidden border border-ink-600 bg-ink-900 shadow-overlay sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-overlay">
								<h2 id="command-palette-title" className="sr-only">
									{t("title")}
								</h2>

								<div className="flex items-center gap-2 border-b border-ink-700 px-4 py-3 focus-within:border-signal-500">
									<Search className="size-4 shrink-0 text-fog-500" aria-hidden="true" />
									<input
										ref={inputRef}
										type="search"
										value={query}
										onChange={(event) => {
											setQuery(event.target.value);
											setActive(0);
										}}
										placeholder={t("placeholder")}
										aria-label={t("title")}
										autoComplete="off"
										spellCheck={false}
										className="h-8 w-full border-0 bg-transparent text-body text-fog-100 placeholder:text-fog-500 focus:outline-none"
									/>
									<button
										type="button"
										onClick={close}
										aria-label={t("close")}
										className="grid size-8 shrink-0 place-items-center rounded-control text-fog-500 transition-colors hover:bg-ink-700 hover:text-fog-100"
									>
										<X className="size-4" aria-hidden="true" />
									</button>
								</div>

								<p aria-live="polite" className="sr-only">
									{activeResult
										? `${t(RESULT_TYPES[activeResult.type])}: ${activeResult.title}`
										: status === "loading"
											? t("loading")
											: hasQuery
												? t("resultsFound", { count: results.length })
												: ""}
								</p>

								{status === "loading" ? (
									<div className="flex flex-col gap-2 p-4" aria-busy="true">
										<p className="text-meta text-fog-500">{t("loading")}</p>
										<Skeleton className="h-10 w-full" />
										<Skeleton className="h-10 w-full" />
										<Skeleton className="h-10 w-full" />
									</div>
								) : status === "error" ? (
									<div role="alert" className="flex flex-col items-start gap-2 p-6">
										<p className="text-body font-medium text-fog-100">{t("error")}</p>
										<p className="text-meta text-fog-500">{t("errorBody")}</p>
										<Button
											type="button"
											size="sm"
											variant="secondary"
											onClick={() => setRetryNonce((value) => value + 1)}
										>
											{t("retry")}
										</Button>
									</div>
								) : results.length === 0 ? (
									<div className="p-3">
										<EmptyState
											title={t("emptyTitle", { query: parseSearchQuery(query) })}
											body={t("emptyBody")}
										/>
									</div>
								) : (
									<ul
										ref={listRef}
										aria-label={hasQuery ? t("results") : t("pages")}
										className="flex-1 overflow-y-auto py-1"
									>
										{results.map((result, index) => {
											const selected = index === activeIndex;
											const statusBadge =
												result.type === "incident" && result.status ? (
													<IncidentStatusBadge status={result.status} />
												) : result.type === "device" && result.status ? (
													<ApprovalBadge status={result.status} />
												) : null;
											const meta =
												result.type === "device"
													? (result.meta ?? t("unassigned"))
													: result.type === "vehicle"
														? result.meta
														: null;
											return (
												<li key={`${result.type}-${result.id}`}>
													<button
														type="button"
														aria-current={selected ? "true" : undefined}
														data-active={selected ? "true" : undefined}
														data-search-option="true"
														onMouseEnter={() => setActive(index)}
														onFocus={() => setActive(index)}
														onClick={() => go(result)}
														className={cn(
															"flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
															selected ? "bg-ink-700/70" : "hover:bg-ink-800",
														)}
													>
														<span className="grid size-8 shrink-0 place-items-center rounded-control border border-ink-600 bg-ink-900 text-fog-400">
															<ResultIcon result={result} />
														</span>
														<span className="min-w-0 flex-1">
															<span className="flex min-w-0 flex-wrap items-center gap-2">
																<span className="truncate text-body font-medium text-fog-100">
																	{result.title}
																</span>
																{statusBadge}
															</span>
															<span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-fog-500">
																{result.subtitle ? (
																	<span
																		className={cn(
																			"min-w-0 truncate",
																			result.type !== "vehicle" && "font-mono",
																		)}
																	>
																		{result.subtitle}
																	</span>
																) : null}
																{meta ? <span className="min-w-0 truncate">{meta}</span> : null}
																{result.timestamp ? (
																	<time
																		dateTime={result.timestamp}
																		title={formatDateTime(result.timestamp, locale)}
																	>
																		{formatRelative(result.timestamp)}
																	</time>
																) : null}
															</span>
														</span>
														<span className="shrink-0 text-meta text-fog-500">
															{t(RESULT_TYPES[result.type])}
														</span>
													</button>
												</li>
											);
										})}
									</ul>
								)}

								<div className="flex items-center justify-between gap-3 border-t border-ink-700 px-4 py-2.5 text-meta text-fog-500">
									<span>{t("moveHint")}</span>
									<kbd className="hidden rounded-control border border-ink-600 px-1 font-mono text-meta sm:inline">
										{t("shortcut")}
									</kbd>
								</div>
							</div>
						</dialog>,
						document.body,
					)
				: null}
		</>
	);
}
