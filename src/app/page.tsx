import Link from "next/link";
import { redirect } from "next/navigation";

import { AccessCodeGate } from "@/app/_components/access-code-gate";
import { ConsentGate } from "@/app/_components/consent-gate";
import { EmailAuthForm } from "@/app/_components/email-auth-form";
import { HomeInsights } from "@/app/_components/home-insights";
import { SignOutButton } from "@/app/_components/sign-out-button";
import { TrialExpiredGate } from "@/app/_components/trial-expired-gate";
import { hasAccessGranted, isTrialExpired } from "@/server/access";
import { auth } from "@/server/better-auth";
import { getSession } from "@/server/better-auth/server";
import { hasCurrentConsent } from "@/server/consent";
import { api, HydrateClient } from "@/trpc/server";

function AddPageIcon() {
	return (
		<svg aria-hidden="true" height="20" viewBox="0 0 20 20" width="20">
			<title>Add today&rsquo;s page</title>
			<rect
				height="14"
				rx="1"
				stroke="currentColor"
				strokeWidth="1.4"
				width="11"
				x="4.5"
				y="3"
			/>
			<path
				d="M10 8 V13 M7.5 10.5 H12.5"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth="1.4"
			/>
		</svg>
	);
}

function foldDiamond(cx: number, cy: number, s: number) {
	return `M${cx} ${cy - s} L${cx + s} ${cy} L${cx} ${cy + s} L${cx - s} ${cy} Z`;
}

function HeroFoldMotif() {
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute right-0 bottom-0 h-[220px] w-[220px] translate-x-1/4 translate-y-1/4 sm:h-[340px] sm:w-[340px] sm:translate-x-1/6"
			viewBox="0 0 340 340"
		>
			<title>Decorative fold motif</title>
			<path
				d={`M170 60 L170 280 M60 170 L280 170 M100 100 L240 240 M240 100 L100 240`}
				stroke="var(--color-indigo-500)"
				strokeOpacity="0.35"
				strokeWidth="1"
			/>
			<path
				d={foldDiamond(170, 170, 95)}
				fill="none"
				stroke="var(--color-indigo-400)"
				strokeOpacity="0.4"
				strokeWidth="1.5"
			/>
			<path
				d={foldDiamond(170, 170, 55)}
				fill="none"
				stroke="var(--color-indigo-400)"
				strokeOpacity="0.55"
				strokeWidth="1.5"
			/>
			<path
				d={foldDiamond(170, 170, 22)}
				fill="var(--color-gold-500)"
				stroke="var(--color-gold-500)"
				strokeWidth="1.5"
			/>
		</svg>
	);
}

export default async function Home() {
	const session = await getSession();

	if (!session) {
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
						One entry, one date
					</p>
					<h1 className="font-semibold text-2xl text-ink-900">
						Handwritten pages, folded into insight
					</h1>
					<p className="text-ink-600 text-sm">
						Photograph a page from your journal and we&rsquo;ll surface what it
						says about your mood, sleep, and progress over time.
					</p>
					<form className="w-full">
						<button
							className="w-full rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
							formAction={async () => {
								"use server";
								const res = await auth.api.signInSocial({
									body: {
										provider: "github",
										callbackURL: "/",
									},
								});
								if (!res.url) {
									throw new Error("No URL returned from signInSocial");
								}
								redirect(res.url);
							}}
							type="submit"
						>
							Sign in with GitHub
						</button>
					</form>

					<div className="flex w-full items-center gap-3 text-ink-600 text-xs uppercase tracking-[0.15em]">
						<span className="h-px flex-1 bg-indigo-500/20" />
						or
						<span className="h-px flex-1 bg-indigo-500/20" />
					</div>

					<EmailAuthForm />
				</div>
			</main>
		);
	}

	// First gate after signing in: an account nobody let into the beta doesn't
	// get as far as the trial or consent questions.
	if (!(await hasAccessGranted(session.user.id))) {
		return <AccessCodeGate />;
	}

	if (isTrialExpired(session.user.createdAt)) {
		return <TrialExpiredGate />;
	}

	if (!(await hasCurrentConsent(session.user.id))) {
		return <ConsentGate />;
	}

	void api.insight.latest.prefetch();

	return (
		<HydrateClient>
			<main
				className="relative min-h-screen bg-indigo-700 text-paper-100"
				style={{
					backgroundImage:
						"repeating-linear-gradient(115deg, var(--color-crease) 0px, var(--color-crease) 1px, transparent 1px, transparent 96px)",
				}}
			>
				<div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12 sm:px-10 sm:py-16">
					<section className="relative animate-[fold-in_0.5s_ease-out] overflow-hidden rounded-sm border-indigo-500 border-b pb-8 motion-reduce:animate-none">
						<HeroFoldMotif />
						<header className="relative flex items-start justify-between gap-4">
							<h1 className="font-bold text-3xl text-paper-100 leading-tight sm:text-4xl">
								{session.user?.name
									? `Hi ${session.user.name.split(" ")[0]}`
									: "Hi there"}
							</h1>
							<div className="flex shrink-0 items-center gap-4">
								<Link
									className="whitespace-nowrap text-indigo-400 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 focus-visible:outline-offset-2"
									href="/settings"
								>
									Settings
								</Link>
								<SignOutButton className="whitespace-nowrap text-indigo-400 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 focus-visible:outline-offset-2" />
							</div>
						</header>

						<Link
							className="relative mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-7 py-4 font-medium text-lg text-paper-100 shadow-[0_14px_30px_-16px_rgba(0,0,0,0.7)] transition-all hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-[0_18px_36px_-14px_rgba(0,0,0,0.75)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 focus-visible:outline-offset-2 active:translate-y-0"
							href="/capture"
						>
							<AddPageIcon />
							Add today&rsquo;s page
						</Link>
					</section>

					<HomeInsights />
				</div>
			</main>
		</HydrateClient>
	);
}
