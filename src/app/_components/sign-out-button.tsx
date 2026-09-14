"use client";

import { signOutAndReload } from "@/server/better-auth/client";

export function SignOutButton({ className }: { className: string }) {
	return (
		<button
			className={className}
			onClick={() => void signOutAndReload()}
			type="button"
		>
			Sign out
		</button>
	);
}
