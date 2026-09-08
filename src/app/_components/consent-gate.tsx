"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/lib/error-message";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

export function ConsentGate() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const acceptMutation = api.consent.accept.useMutation();

	async function handleAccept() {
		setError(null);
		try {
			await acceptMutation.mutateAsync();
			router.refresh();
		} catch (err) {
			setError(errorMessage(err, "Couldn't save that. Try again?"));
		}
	}

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
					Before you continue
				</p>
				<h1 className="font-semibold text-2xl text-ink-900">
					Quick, honest note about your data
				</h1>
				<p className="text-ink-600 text-sm">
					Your data — the photos you upload, the text transcribed from them, and
					the insights pulled from that text — is processed by us and by
					Anthropic&rsquo;s Claude, which we use to read your photos and find
					patterns in what you write. We don&rsquo;t attach your name or account
					details to what&rsquo;s sent for processing.
				</p>
				<p className="text-ink-600 text-sm">
					It&rsquo;s encrypted and stored, and never shared with other users.
				</p>
				<p className="text-ink-600 text-sm">
					Deleting your account removes everything we store, immediately. We
					can&rsquo;t delete what&rsquo;s already been sent to Claude for
					processing — check{" "}
					<a
						className="underline decoration-indigo-500/40 underline-offset-2"
						href="https://www.anthropic.com/legal/privacy"
						rel="noreferrer"
						target="_blank"
					>
						Anthropic&rsquo;s own data policy
					</a>{" "}
					for how they handle it from there.
				</p>
				<p className="text-ink-600 text-sm">
					You can ask us to delete all of it, at any time, from Settings.
				</p>

				{error && <p className="text-ink-600 text-sm">{error}</p>}

				<button
					className="w-full rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
					disabled={acceptMutation.isPending}
					onClick={handleAccept}
					type="button"
				>
					{acceptMutation.isPending ? "Saving…" : "Accept and continue"}
				</button>
				<button
					className="text-ink-600 text-xs underline decoration-indigo-500/40 underline-offset-4 hover:text-ink-900"
					onClick={() =>
						authClient.signOut({
							fetchOptions: { onSuccess: () => router.push("/") },
						})
					}
					type="button"
				>
					Not right now — sign out instead
				</button>
			</div>
		</main>
	);
}
