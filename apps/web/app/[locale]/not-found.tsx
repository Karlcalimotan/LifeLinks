import { Link } from "@/i18n/routing";

export default function NotFound() {
	return (
		<main className="grid min-h-screen place-items-center px-6">
			<div className="max-w-md text-center">
				<p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">404</p>
				<h1 className="mt-3 text-3xl font-semibold text-white">Page not found</h1>
				<p className="mt-3 text-sm text-slate-400">
					The page you are looking for does not exist or has moved.
				</p>
				<Link
					href="/dashboard"
					className="mt-6 inline-flex h-9 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-slate-950"
				>
					Back to dashboard
				</Link>
			</div>
		</main>
	);
}
