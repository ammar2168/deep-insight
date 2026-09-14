"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { errorMessage } from "@/lib/error-message";
import { signOutAndReload } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

function SpinnerIcon() {
	return (
		<svg
			aria-hidden="true"
			className="animate-[spin_0.9s_linear_infinite] motion-reduce:animate-none"
			height="14"
			viewBox="0 0 16 16"
			width="14"
		>
			<title>Checking</title>
			<path
				d="M8 1 L14 8 L8 15 L2 8 Z"
				fill="none"
				stroke="currentColor"
				strokeDasharray="21 21"
				strokeLinejoin="round"
				strokeWidth="1.5"
			/>
		</svg>
	);
}

export function AccessCodeGate() {
	const router = useRouter();
	const codeInputId = useId();
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const redeemMutation = api.settings.redeemCode.useMutation();

	async function handleRedeem(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		try {
			await redeemMutation.mutateAsync({ code: code.trim() });
			// The gate is a server-side check, so the page has to re-run it
			// rather than just swapping client state.
			router.refresh();
		} catch (err) {
			setError(errorMessage(err, "Couldn't check that code. Try again?"));
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
			<div className="flex w-full max-w-sm flex-col gap-6 rounded-sm bg-paper-100 p-8 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)]">
				<div className="flex flex-col gap-2 text-center">
					<p className="font-mono text-ink-600 text-xs uppercase tracking-[0.2em]">
						Invite only, for now
					</p>
					<h1 className="font-semibold text-2xl text-ink-900">
						Enter your access code
					</h1>
					<p className="text-ink-600 text-sm">
						This is a small private beta. Your code works once, on this account
						only.
					</p>
				</div>

				<form className="flex flex-col gap-3" onSubmit={handleRedeem}>
					<label className="sr-only" htmlFor={codeInputId}>
						Access code
					</label>
					<input
						autoComplete="off"
						className="rounded-sm border border-indigo-500/20 bg-paper-200 px-3 py-2.5 text-[15px] text-ink-900 transition-colors focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
						id={codeInputId}
						onChange={(e) => setCode(e.target.value)}
						placeholder="Enter code"
						type="text"
						value={code}
					/>
					<button
						className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
						disabled={code.trim().length === 0 || redeemMutation.isPending}
						type="submit"
					>
						{redeemMutation.isPending && <SpinnerIcon />}
						{redeemMutation.isPending ? "Checking…" : "Continue"}
					</button>
					{error && <p className="text-ink-600 text-sm">{error}</p>}
				</form>

				<button
					className="text-ink-600 text-xs underline decoration-indigo-500/40 underline-offset-4 transition-colors hover:text-ink-900"
					onClick={() => void signOutAndReload()}
					type="button"
				>
					Sign out
				</button>
			</div>
		</main>
	);
}
