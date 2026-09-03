"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { authClient } from "@/server/better-auth/client";

function errorMessage(err: unknown, fallback: string) {
	return err instanceof Error && err.message ? err.message : fallback;
}

export function EmailAuthForm() {
	const router = useRouter();
	const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const nameId = useId();
	const emailId = useId();
	const passwordId = useId();

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setPending(true);

		try {
			const { error: authError } =
				mode === "sign-up"
					? await authClient.signUp.email({
							email,
							password,
							name: name.trim() || email.split("@")[0] || "there",
						})
					: await authClient.signIn.email({ email, password });

			if (authError) {
				setError(authError.message ?? "Something went wrong. Try again?");
				setPending(false);
				return;
			}
			router.push("/");
			router.refresh();
		} catch (err) {
			setError(errorMessage(err, "Something went wrong. Try again?"));
			setPending(false);
		}
	}

	return (
		<form className="flex w-full flex-col gap-3" onSubmit={handleSubmit}>
			{mode === "sign-up" && (
				<div>
					<label className="sr-only" htmlFor={nameId}>
						Name
					</label>
					<input
						className="w-full rounded-sm border border-indigo-500/20 bg-paper-200 px-3 py-2.5 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600/60 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
						id={nameId}
						onChange={(e) => setName(e.target.value)}
						placeholder="Your name"
						type="text"
						value={name}
					/>
				</div>
			)}
			<div>
				<label className="sr-only" htmlFor={emailId}>
					Email
				</label>
				<input
					autoComplete="email"
					className="w-full rounded-sm border border-indigo-500/20 bg-paper-200 px-3 py-2.5 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600/60 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
					id={emailId}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="Email"
					required
					type="email"
					value={email}
				/>
			</div>
			<div>
				<label className="sr-only" htmlFor={passwordId}>
					Password
				</label>
				<input
					autoComplete={
						mode === "sign-up" ? "new-password" : "current-password"
					}
					className="w-full rounded-sm border border-indigo-500/20 bg-paper-200 px-3 py-2.5 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600/60 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
					id={passwordId}
					minLength={8}
					onChange={(e) => setPassword(e.target.value)}
					placeholder="Password"
					required
					type="password"
					value={password}
				/>
			</div>

			{error && <p className="text-ink-600 text-sm">{error}</p>}

			<button
				className="w-full rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
				disabled={pending}
				type="submit"
			>
				{pending
					? mode === "sign-up"
						? "Creating account…"
						: "Signing in…"
					: mode === "sign-up"
						? "Create account"
						: "Sign in"}
			</button>
			<button
				className="text-ink-600 text-xs underline decoration-indigo-500/40 underline-offset-4 hover:text-ink-900"
				onClick={() => {
					setMode((m) => (m === "sign-up" ? "sign-in" : "sign-up"));
					setError(null);
				}}
				type="button"
			>
				{mode === "sign-up"
					? "Already have an account? Sign in"
					: "New here? Create an account"}
			</button>
		</form>
	);
}
