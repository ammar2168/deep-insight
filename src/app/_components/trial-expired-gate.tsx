"use client";

import { signOutAndReload } from "@/server/better-auth/client";

export function TrialExpiredGate() {
	return (
		<main
			className="relative flex min-h-screen items-center justify-center bg-indigo-700 px-6 py-16 text-paper-100"
			style={{
				backgroundImage:
					"repeating-linear-gradient(115deg, var(--color-crease) 0px, var(--color-crease) 1px, transparent 1px, transparent 96px)",
			}}
		>
			<div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-sm bg-paper-100 p-8 text-center shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)]">
				<p className="font-mono text-ink-600 text-xs uppercase tracking-[0.2em]">
					Your free month is up
				</p>
				<h1 className="font-semibold text-2xl text-ink-900">
					Thanks for trying this out
				</h1>
				<p className="text-ink-600 text-sm">
					Pricing isn&rsquo;t set up yet — we&rsquo;ll be in touch when it is.
					Your entries are safe and encrypted in the meantime.
				</p>
				<button
					className="w-full rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
					onClick={() => void signOutAndReload()}
					type="button"
				>
					Sign out
				</button>
			</div>
		</main>
	);
}
