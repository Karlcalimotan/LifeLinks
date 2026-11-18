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
					background: "#071013",
					color: "#e8f1f2",
					fontFamily: "ui-sans-serif, system-ui, sans-serif",
					display: "grid",
					minHeight: "100vh",
					placeItems: "center",
					padding: 24,
				}}
			>
				<div style={{ maxWidth: 440, textAlign: "center" }}>
					<p style={{ fontSize: 12, color: "#ff5a1f" }}>
						<span
							style={{
								display: "inline-block",
								width: 10,
								height: 10,
								marginRight: 8,
								background: "#ff5a1f",
							}}
						/>
						LifeLink
					</p>
					<h1
						style={{
							fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
							fontSize: 34,
							margin: "12px 0",
						}}
					>
						Something went wrong
					</h1>
					<p style={{ fontSize: 14, color: "#8fa3a6", lineHeight: 1.6 }}>
						{error.message || "The console could not render this request."}
					</p>
					<button
						type="button"
						onClick={reset}
						style={{
							marginTop: 20,
							background: "#ff5a1f",
							color: "#071013",
							border: 0,
							borderRadius: 4,
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
