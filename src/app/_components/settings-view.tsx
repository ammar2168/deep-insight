"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { errorMessage } from "@/lib/error-message";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

function BackIcon() {
	return (
		<svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
			<title>Back</title>
			<path
				d="M8.5 2.5 L3 7 L8.5 11.5"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			/>
		</svg>
	);
}

function SpinnerIcon() {
	return (
		<svg
			aria-hidden="true"
			className="animate-[spin_0.9s_linear_infinite] motion-reduce:animate-none"
			height="14"
			viewBox="0 0 16 16"
			width="14"
		>
			<title>Working</title>
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

function AccessCodeSection() {
	const codeInputId = useId();
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [redeemed, setRedeemed] = useState(false);
	const redeemMutation = api.settings.redeemCode.useMutation();

	async function handleRedeem(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		try {
			await redeemMutation.mutateAsync({ code });
			setRedeemed(true);
		} catch (err) {
			setError(errorMessage(err, "Couldn't redeem that code. Try again?"));
		}
	}

	return (
		<section className="flex flex-col gap-3 rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
			<div>
				<h2 className="font-semibold text-ink-900 text-lg">Have a code?</h2>
				<p className="mt-1 text-ink-600 text-sm">
					Raises your daily chat question limit.
				</p>
			</div>
			{redeemed ? (
				<p className="text-ink-600 text-sm">
					Code applied — enjoy the extra room.
				</p>
			) : (
				<form
					className="flex flex-col gap-3 sm:flex-row"
					onSubmit={handleRedeem}
				>
					<label className="sr-only" htmlFor={codeInputId}>
						Access code
					</label>
					<input
						className="flex-1 rounded-sm border border-indigo-500/20 bg-paper-200 px-3 py-2 text-[15px] text-ink-900 transition-colors focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
						id={codeInputId}
						onChange={(e) => setCode(e.target.value)}
						placeholder="Enter code"
						type="text"
						value={code}
					/>
					<button
						className="inline-flex w-fit items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 font-medium text-paper-100 text-xs transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
						disabled={code.trim().length === 0 || redeemMutation.isPending}
						type="submit"
					>
						{redeemMutation.isPending && <SpinnerIcon />}
						{redeemMutation.isPending ? "Checking…" : "Redeem"}
					</button>
				</form>
			)}
			{error && <p className="text-ink-600 text-sm">{error}</p>}
		</section>
	);
}

const DELETE_CONFIRM_PHRASE = "DELETE";

function DeleteAccountSection() {
	const router = useRouter();
	const confirmInputId = useId();
	const [expanded, setExpanded] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const deleteMutation = api.settings.deleteAccount.useMutation();

	async function handleDelete() {
		setError(null);
		try {
			await deleteMutation.mutateAsync();
			await authClient.signOut();
			router.push("/");
		} catch (err) {
			setError(errorMessage(err, "Couldn't delete your account. Try again?"));
		}
	}

	if (!expanded) {
		return (
			<div className="flex flex-col gap-3 rounded-sm border border-indigo-500/40 bg-paper-200 p-4">
				<div>
					<p className="font-medium text-ink-900 text-sm">Delete account</p>
					<p className="mt-1 text-ink-600 text-sm">
						Permanently deletes your account and everything in it — every entry,
						insight, and photo you&rsquo;ve uploaded. This can&rsquo;t be
						undone.
					</p>
				</div>
				<button
					className="w-fit rounded-full bg-indigo-600 px-4 py-2 font-medium text-paper-100 text-xs transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
					onClick={() => setExpanded(true)}
					type="button"
				>
					Delete my account
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 rounded-sm border border-indigo-500/40 bg-paper-200 p-4">
			<div>
				<p className="font-medium text-ink-900 text-sm">
					Are you sure? This can&rsquo;t be undone.
				</p>
				<p className="mt-1 text-ink-600 text-sm">
					Your account, every entry, and every insight will be deleted
					immediately and permanently — there&rsquo;s no recovery window.
				</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-ink-600 text-xs" htmlFor={confirmInputId}>
					Type {DELETE_CONFIRM_PHRASE} to confirm
				</label>
				<input
					className="rounded-sm border border-indigo-500/20 bg-paper-100 px-3 py-2 text-[15px] text-ink-900 transition-colors focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
					id={confirmInputId}
					onChange={(e) => setConfirmText(e.target.value)}
					type="text"
					value={confirmText}
				/>
			</div>

			{error && <p className="text-ink-600 text-sm">{error}</p>}

			<div className="flex gap-2">
				<button
					className="rounded-full px-4 py-2 font-medium text-ink-600 text-xs transition-colors hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
					disabled={deleteMutation.isPending}
					onClick={() => {
						setExpanded(false);
						setConfirmText("");
						setError(null);
					}}
					type="button"
				>
					Cancel
				</button>
				<button
					className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 font-medium text-paper-100 text-xs transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
					disabled={
						confirmText !== DELETE_CONFIRM_PHRASE || deleteMutation.isPending
					}
					onClick={handleDelete}
					type="button"
				>
					{deleteMutation.isPending && <SpinnerIcon />}
					{deleteMutation.isPending ? "Deleting…" : "Delete permanently"}
				</button>
			</div>
		</div>
	);
}

export function SettingsView() {
	return (
		<main
			className="relative min-h-screen bg-indigo-700 text-paper-100"
			style={{
				backgroundImage:
					"repeating-linear-gradient(115deg, var(--color-crease) 0px, var(--color-crease) 1px, transparent 1px, transparent 96px)",
			}}
		>
			<div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12 sm:px-10 sm:py-16">
				<header className="flex flex-col gap-3">
					<Link
						className="inline-flex w-fit items-center gap-1.5 text-indigo-400 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
						href="/"
					>
						<BackIcon />
						Home
					</Link>
					<h1 className="font-bold text-3xl text-paper-100 sm:text-4xl">
						Settings
					</h1>
				</header>

				<AccessCodeSection />

				<section className="flex flex-col gap-3 rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
					<div>
						<h2 className="font-semibold text-ink-900 text-lg">
							Export your data
						</h2>
						<p className="mt-1 text-ink-600 text-sm">
							Coming soon — this will let you download everything you&rsquo;ve
							written, decrypted, as a file you keep.
						</p>
					</div>
					<button
						className="w-fit rounded-full bg-indigo-600 px-4 py-2 font-medium text-paper-100 text-xs disabled:cursor-not-allowed disabled:opacity-40"
						disabled
						type="button"
					>
						Download my data
					</button>
				</section>

				<section className="flex flex-col gap-3 rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
					<DeleteAccountSection />
				</section>
			</div>
		</main>
	);
}
