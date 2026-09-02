import { redirect } from "next/navigation";

import { SettingsView } from "@/app/_components/settings-view";
import { getSession } from "@/server/better-auth/server";

export default async function SettingsPage() {
	const session = await getSession();
	if (!session) {
		redirect("/");
	}

	return <SettingsView />;
}
