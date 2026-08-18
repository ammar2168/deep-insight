"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Shown instead of the normal flow whenever checkForCrisisSignal flags — either the
 * OCR'd entry text in /capture, or a chat question in /chat. Deliberately:
 * - Never quotes or repeats what the user wrote; nothing here reflects their own words
 *   back at them.
 * - A friend's tone, not a clinical one.
 * - US and Europe resources given identical visual weight — neither reads as "the
 *   real one" and the other an afterthought.
 * - Lets the user continue afterward; this is a pause, not a wall.
 *
 * A modal is a deliberate choice here (see DESIGN.md / craft-floor's own carve-out):
 * this moment specifically needs protected focus, unlike the rest of this app's world,
 * which avoids modals everywhere else on purpose.
 */
export function CrisisCheckInModal({ onContinue }: { onContinue: () => void }) {
	const titleId = useId();
	const continueButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		continueButtonRef.current?.focus();
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onContinue();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onContinue]);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-dismiss is a mouse/touch convenience; Escape (handled above) and the Continue button already cover keyboard dismissal
		<div
			aria-labelledby={titleId}
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-900/85 p-6 [animation:gentle-scrim-in_0.5s_ease-out] motion-reduce:[animation:none]"
			onClick={(e) => {
				if (e.target === e.currentTarget) onContinue();
			}}
			role="dialog"
		>
			<div className="w-full max-w-[440px] rounded-sm bg-paper-100 p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] [animation:gentle-card-in_0.5s_ease-out] sm:p-8 motion-reduce:[animation:none]">
				<h2
					className="font-semibold text-ink-900 text-xl leading-snug"
					id={titleId}
				>
					Hey, I want to pause for a second.
				</h2>
				<p className="mt-3 text-[15px] text-ink-900 leading-relaxed">
					What you shared sounds like it's been really heavy. I'm not able to
					help with something this serious — but a real person can, right now,
					if you'd like that.
				</p>

				<div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
					<a
						className="rounded-sm border border-indigo-500/20 bg-paper-200 px-4 py-3 text-center transition-colors hover:bg-paper-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
						href="tel:988"
					>
						<p className="font-mono text-[11px] text-ink-600 uppercase tracking-wide">
							United States
						</p>
						<p className="mt-0.5 font-semibold text-ink-900 text-sm">
							Call or text 988
						</p>
					</a>
					<a
						className="rounded-sm border border-indigo-500/20 bg-paper-200 px-4 py-3 text-center transition-colors hover:bg-paper-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
						href="tel:116123"
					>
						<p className="font-mono text-[11px] text-ink-600 uppercase tracking-wide">
							Europe
						</p>
						<p className="mt-0.5 font-semibold text-ink-900 text-sm">
							Call 116 123
						</p>
					</a>
				</div>

				<p className="mt-5 text-ink-600 text-sm leading-relaxed">
					I'm not going anywhere — whenever you're ready, I'm here.
				</p>

				<button
					className="mt-5 w-full rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
					onClick={onContinue}
					ref={continueButtonRef}
					type="button"
				>
					Continue
				</button>
			</div>
		</div>
	);
}
