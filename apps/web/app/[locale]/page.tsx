import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const current = await getCurrentUser();
	redirect(current ? `/${locale}/dashboard` : `/${locale}/login`);
}
