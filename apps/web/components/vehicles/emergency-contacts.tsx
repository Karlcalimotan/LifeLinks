import { ConfirmSubmit } from "@/components/devices/confirm-submit";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactForm, type ContactValues } from "@/components/vehicles/contact-form";
import { archiveEmergencyContactAction } from "@/lib/actions/emergency-contacts";
import { getTranslations } from "next-intl/server";

export interface VehicleContact extends ContactValues {
	email: string | null;
}

/**
 * The owner is the person who knows who should be called. This section is the
 * console path to register those people; the alert paths read the same rows
 * ahead of the organisation list.
 */
export async function EmergencyContacts({
	locale,
	vehicleId,
	contacts,
}: {
	locale: string;
	vehicleId: string;
	contacts: VehicleContact[];
}) {
	const t = await getTranslations({ locale, namespace: "vehicles" });
	const activeCount = contacts.filter((contact) => contact.active).length;

	return (
		<Card id="emergency-contacts">
			<CardHeader>
				<CardTitle>{t("contactsTitle")}</CardTitle>
				<CardDescription>{t("contactsDescription")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<p className="text-meta text-fog-500">
					{t("contactsCount", { active: activeCount, total: contacts.length })}
				</p>

				{contacts.length === 0 ? (
					<p className="rounded-control border border-dashed border-ink-600 bg-ink-900/40 px-4 py-6 text-center text-meta text-fog-500">
						{t("noContacts")}
					</p>
				) : (
					<ul className="flex flex-col gap-3">
						{contacts.map((contact) => (
							<li
								key={contact.id}
								className="rounded-control border border-ink-700 bg-ink-900/40 p-4"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="font-medium text-fog-100">{contact.name}</p>
										<p className="font-mono text-meta text-fog-300">{contact.phone}</p>
										{contact.email ? (
											<p className="text-meta text-fog-500">{contact.email}</p>
										) : null}
									</div>
									<Badge tone={contact.active ? "success" : "muted"}>
										{contact.active ? t("contactIsActive") : t("contactIsArchived")}
									</Badge>
								</div>

								<div className="mt-3 flex flex-wrap items-center gap-2">
									<details className="w-full">
										<summary
											aria-label={t("editContactFor", { name: contact.name })}
											className="inline-flex h-8 cursor-pointer items-center rounded-panel border border-ink-600 px-3 text-meta text-fog-100 hover:bg-ink-700/60"
										>
											{t("editContact")}
										</summary>
										<div className="mt-3 border-t border-ink-700 pt-3">
											<ContactForm locale={locale} vehicleId={vehicleId} contact={contact} />
										</div>
									</details>
									{contact.active ? (
										<form action={archiveEmergencyContactAction}>
											<input type="hidden" name="locale" value={locale} />
											<input type="hidden" name="contactId" value={contact.id} />
											<ConfirmSubmit
												message={t("contactArchiveConfirm", { name: contact.name })}
												confirmLabel={t("contactArchive")}
												cancelLabel={t("cancel")}
												variant="danger"
											>
												{t("contactArchive")}
											</ConfirmSubmit>
										</form>
									) : null}
								</div>
							</li>
						))}
					</ul>
				)}

				<details className="rounded-control border border-ink-700 bg-ink-900/40 p-4">
					<summary className="cursor-pointer text-meta font-medium text-fog-100">
						{t("addContact")}
					</summary>
					<div className="mt-3 border-t border-ink-700 pt-3">
						<ContactForm locale={locale} vehicleId={vehicleId} />
					</div>
				</details>

				<p className="text-meta text-fog-500">{t("contactsAudited")}</p>
			</CardContent>
		</Card>
	);
}
