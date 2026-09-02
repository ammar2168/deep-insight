"use client";

import Link from "next/link";

import { DayCapture, getLocalDateString } from "@/app/_components/day-capture";

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

export default function CapturePage() {
	return (
		<main
			className="relative min-h-screen bg-indigo-700 text-paper-100"
			style={{
				backgroundImage:
					"repeating-linear-gradient(115deg, var(--color-crease) 0px, var(--color-crease) 1px, transparent 1px, transparent 96px)",
			}}
		>
			<div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12 sm:px-10 sm:py-16">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-indigo-400 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
					href="/"
				>
					<BackIcon />
					Home
				</Link>

				<DayCapture
					description="Every photo you add here folds into one entry for today, then unfolds into a handful of insights."
					eyebrow="One entry, one date"
					headerExtra={
						<p className="mt-2 text-indigo-400 text-sm">
							Catching up on more than one day?{" "}
							<Link
								className="underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100"
								href="/capture/batch"
							>
								Add several days at once
							</Link>
							.
						</p>
					}
					initialDate={getLocalDateString()}
					initialPhotos={[]}
					renderSavedAction={() => (
						<Link
							className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
							href="/"
						>
							Back to your insights
						</Link>
					)}
					title="Add today’s page"
				/>
			</div>
		</main>
	);
}
