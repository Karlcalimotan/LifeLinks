import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/routing";

export default function NotFound() {
	return (
		<main className="grid min-h-screen place-items-center px-6">
			<div className="w-full max-w-md">
				<Logo />
				<div className="mt-12 border-t border-ink-700 pt-8">
					<p className="font-display text-6xl leading-none text-signal-ink">404</p>
					<h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-fog-50">
						Page not found
					</h1>
					<p className="mt-3 text-sm leading-relaxed text-fog-500">
						The page you are looking for does not exist or has moved.
					</p>
					<Link
						href="/dashboard"
						className="mt-6 inline-flex h-9 items-center rounded bg-signal-500 px-4 text-sm font-medium text-on-accent transition-colors hover:bg-signal-400"
					>
						Back to dashboard
					</Link>
				</div>
			</div>
		</main>
	);
}
