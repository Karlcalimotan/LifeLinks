import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Label } from "@/components/ui/field";
import { updateImpactThresholdAction } from "@/lib/actions/impact-threshold";

export function ImpactThresholdCard({
	currentG,
	locale,
	labels,
}: {
	currentG: number;
	locale: string;
	labels: {
		title: string;
		body: string;
		threshold: string;
		hint: string;
		save: string;
	};
}) {
	return (
		<Card className="min-w-0 overflow-hidden">
			<div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-start sm:gap-6">
				<CardHeader className="p-0">
					<CardTitle>{labels.title}</CardTitle>
					<CardDescription>{labels.body}</CardDescription>
				</CardHeader>
				<CardContent className="min-w-0 p-0">
					<form action={updateImpactThresholdAction} className="flex min-w-0 flex-col gap-3">
						<input type="hidden" name="locale" value={locale} />
						<Field>
							<Label htmlFor="impact-threshold">{labels.threshold}</Label>
							<Input
								id="impact-threshold"
								name="threshold"
								type="number"
								inputMode="decimal"
								min={1.5}
								max={16}
								step={0.1}
								defaultValue={currentG}
								required
								aria-describedby="impact-threshold-hint"
							/>
							<p id="impact-threshold-hint" className="text-meta leading-snug text-fog-500">
								{labels.hint}
							</p>
						</Field>
						<Button type="submit" className="w-full">
							{labels.save}
						</Button>
					</form>
				</CardContent>
			</div>
		</Card>
	);
}
