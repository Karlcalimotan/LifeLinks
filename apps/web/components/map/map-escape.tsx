"use client";

import { useRouter } from "@/i18n/routing";
import { useEffect } from "react";

/**
 * Esc closes the selected-vehicle panel by returning to the same map URL with
 * the `vehicle` parameter removed. The close button is the visible control; this
 * only adds the keyboard shortcut.
 */
export function MapEscape({ href }: { href: string }) {
	const router = useRouter();

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			const target = event.target as HTMLElement | null;
			if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
			event.preventDefault();
			router.push(href);
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [href, router]);

	return null;
}
