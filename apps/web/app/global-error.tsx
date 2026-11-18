"use client";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<html lang="en">
			<body
				style={{
					background: "#060b14",
					color: "#e2e8f0",
					fontFamily: "ui-sans-serif, system-ui, sans-serif",
					display: "grid",
					minHeight: "100vh",
					placeItems: "center",
					padding: 24,
				}}
			>
				<div style={{ maxWidth: 440, textAlign: "center" }}>
					<p
						style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#64748b" }}
					>
						LifeLink
					</p>
					<h1 style={{ fontSize: 28, margin: "12px 0" }}>Something went wrong</h1>
					<p style={{ fontSize: 14, color: "#94a3b8" }}>
						{error.message || "The console could not render this request."}
					</p>
					<button
						type="button"
						onClick={reset}
						style={{
							marginTop: 20,
							background: "#22d3ee",
							color: "#020617",
							border: 0,
							borderRadius: 8,
							padding: "10px 16px",
							fontWeight: 600,
							cursor: "pointer",
						}}
					>
						Try again
					</button>
				</div>
			</body>
		</html>
	);
}
