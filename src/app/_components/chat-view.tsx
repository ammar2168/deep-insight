"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import Markdown from "react-markdown";

import { CrisisCheckInModal } from "@/app/_components/crisis-check-in-modal";
import { errorMessage } from "@/lib/error-message";
import { api } from "@/trpc/react";

type Message = {
	id: string;
	question: string;
	answer: string | null;
	error: string | null;
	limitReached: boolean;
	// Only meaningful when limitReached is true — false either when there's no
	// limit involved at all, or when the user already redeemed a code and is
	// blocked at the boosted ceiling, where offering "have a code?" again
	// wouldn't make sense (they've got nothing left to enter).
	canRedeemCode: boolean;
};

const SUGGESTIONS = [
	"How has my mood been the last two months?",
	"What patterns show up in my sleep?",
	"Am I making progress on the Marlowe project?",
];

function SendIcon() {
	return (
		<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
			<title>Send</title>
			<path
				d="M2 8 L14 8 M9 3 L14 8 L9 13"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			/>
		</svg>
	);
}

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
			<title>Thinking</title>
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

function ArrowIcon() {
	return (
		<svg aria-hidden="true" height="12" viewBox="0 0 14 14" width="12">
			<title>Ask this</title>
			<path
				d="M2 7 H12 M7.5 3 L12 7 L7.5 11"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			/>
		</svg>
	);
}

/**
 * The system prompt closes an answer with a brief, natural offer to go
 * deeper — "when it fits the question... skip it if it would feel forced" —
 * so it's not always there. When the last paragraph reads as one, split it
 * out so it can render as a clickable next step instead of just prose the
 * user has to retype themselves. Never treated as a claim to verify (it's
 * UI structure, not a fact about the user's data) — worst case a heuristic
 * miss just leaves it as plain trailing text, same as today.
 */
function extractFollowUp(answer: string): {
	body: string;
	followUp: string | null;
} {
	const paragraphs = answer.split(/\n\s*\n/);
	const last = paragraphs[paragraphs.length - 1]?.trim();
	if (paragraphs.length > 1 && last && last.length > 10 && last.endsWith("?")) {
		return {
			body: paragraphs.slice(0, -1).join("\n\n").trim(),
			followUp: last,
		};
	}
	return { body: answer, followUp: null };
}

function AnswerMarkdown({ text }: { text: string }) {
	return (
		<div className="text-ink-900 text-sm leading-relaxed [&>*+*]:mt-3">
			<Markdown
				components={{
					p: ({ children }) => <p>{children}</p>,
					strong: ({ children }) => (
						<strong className="font-semibold">{children}</strong>
					),
					ul: ({ children }) => (
						<ul className="flex flex-col gap-1.5 pl-5 marker:text-indigo-500/70 [&]:list-disc">
							{children}
						</ul>
					),
					ol: ({ children }) => (
						<ol className="flex flex-col gap-1.5 pl-5 marker:font-mono marker:text-indigo-600 marker:text-xs [&]:list-decimal">
							{children}
						</ol>
					),
					li: ({ children }) => <li className="pl-1">{children}</li>,
					a: ({ children, href }) => (
						<a
							className="underline decoration-indigo-500/40 underline-offset-2"
							href={href}
							rel="noreferrer"
							target="_blank"
						>
							{children}
						</a>
					),
				}}
			>
				{text}
			</Markdown>
		</div>
	);
}

export function ChatView() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const askInputId = useId();
	const [question, setQuestion] = useState("");
	const [messages, setMessages] = useState<Message[]>([]);
	const [crisisCheckIn, setCrisisCheckIn] = useState(false);
	const consumedInitialQuery = useRef(false);
	const askMutation = api.chat.ask.useMutation();

	async function ask(text: string) {
		const q = text.trim();
		if (!q) return;

		const history = messages
			.filter((m): m is Message & { answer: string } => m.answer !== null)
			.map((m) => ({ question: m.question, answer: m.answer }));

		const id = crypto.randomUUID();
		setMessages((prev) => [
			...prev,
			{
				id,
				question: q,
				answer: null,
				error: null,
				limitReached: false,
				canRedeemCode: false,
			},
		]);
		setQuestion("");

		try {
			const result = await askMutation.mutateAsync({ question: q, history });
			if (result.crisis) {
				// Don't leave the question sitting in the transcript for them to see
				// again — show the check-in instead, nothing about it stays on screen.
				setMessages((prev) => prev.filter((m) => m.id !== id));
				setCrisisCheckIn(true);
				return;
			}
			if (result.limitReached) {
				setMessages((prev) =>
					prev.map((m) =>
						m.id === id
							? {
									...m,
									error: `You've used today's ${result.dailyLimit} free questions — more tomorrow.`,
									limitReached: true,
									canRedeemCode: !result.codeRedeemed,
								}
							: m,
					),
				);
				return;
			}
			setMessages((prev) =>
				prev.map((m) => (m.id === id ? { ...m, answer: result.answer } : m)),
			);
		} catch (err) {
			setMessages((prev) =>
				prev.map((m) =>
					m.id === id
						? {
								...m,
								error: errorMessage(err, "Couldn't get an answer. Try again?"),
							}
						: m,
				),
			);
		}
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: only ever runs once, guarded by the ref; ask reads current state via closure at call time, which is fine for a single initial fire
	useEffect(() => {
		if (consumedInitialQuery.current) return;
		consumedInitialQuery.current = true;
		const initial = searchParams.get("q");
		if (initial?.trim()) {
			router.replace("/chat");
			void ask(initial);
		}
	}, [searchParams, router]);

	return (
		<main
			className="relative min-h-screen bg-indigo-700 text-paper-100"
			style={{
				backgroundImage:
					"repeating-linear-gradient(115deg, var(--color-crease) 0px, var(--color-crease) 1px, transparent 1px, transparent 96px)",
			}}
		>
			{crisisCheckIn && (
				<CrisisCheckInModal onContinue={() => setCrisisCheckIn(false)} />
			)}

			<div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12 sm:px-10 sm:py-16">
				<header className="flex flex-col gap-3">
					<Link
						className="inline-flex w-fit items-center gap-1.5 text-indigo-400 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
						href="/"
					>
						<BackIcon />
						Home
					</Link>
					<h1 className="font-bold text-3xl text-paper-100 sm:text-4xl">
						Go deeper. Reflect on your insights
					</h1>
				</header>

				<section
					aria-label="Conversation"
					className="flex min-h-[50vh] flex-col rounded-sm bg-paper-100 p-6 shadow-[0_14px_34px_-18px_rgba(0,0,0,0.55)] sm:p-8"
				>
					{messages.length === 0 ? (
						<div className="flex flex-1 flex-col justify-center gap-5">
							<p className="text-ink-600 text-sm">
								Nothing asked yet. Try one of these, or type your own below.
							</p>
							<ul className="flex flex-wrap gap-2">
								{SUGGESTIONS.map((s) => (
									<li key={s}>
										<button
											className="max-w-full rounded-full bg-paper-200 px-4 py-2 text-left text-ink-900 text-sm transition-colors hover:bg-paper-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
											onClick={() => ask(s)}
											type="button"
										>
											{s}
										</button>
									</li>
								))}
							</ul>
						</div>
					) : (
						<ul className="flex flex-1 flex-col gap-6">
							{messages.map((m, i) => {
								const { body, followUp } =
									m.answer !== null
										? extractFollowUp(m.answer)
										: { body: "", followUp: null };
								return (
									<li
										className={
											i === 0
												? "animate-[fold-in_0.4s_ease-out_backwards]"
												: "animate-[fold-in_0.4s_ease-out_backwards] border-indigo-500/15 border-t pt-6"
										}
										key={m.id}
									>
										<p className="font-mono text-indigo-600 text-xs uppercase tracking-[0.15em]">
											You asked
										</p>
										<p className="mt-1 font-semibold text-ink-900 text-lg">
											{m.question}
										</p>
										{m.answer !== null ? (
											<div className="mt-3 flex flex-col gap-3 rounded-sm bg-paper-200 p-3">
												<AnswerMarkdown text={body} />
												{followUp && (
													<button
														className="inline-flex w-fit items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-left text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
														onClick={() => {
															// Deliberately not ask(followUp): echoing the model's own
															// question back at it read as strange in testing ("looks
															// like that got copy-pasted back to me") — a plain
															// affirmative is unambiguous with the offer still right
															// there in history, and reads naturally in the transcript.
															ask("Yes, let's do that.");
														}}
														type="button"
													>
														{followUp}
														<ArrowIcon />
													</button>
												)}
											</div>
										) : m.error !== null ? (
											<div className="mt-3 flex flex-col gap-1.5 rounded-sm bg-paper-200 p-3 text-ink-600 text-sm">
												<p>{m.error}</p>
												{m.canRedeemCode && (
													<p>
														Have a code?{" "}
														<Link
															className="underline decoration-indigo-500/40 underline-offset-2"
															href="/settings"
														>
															Enter it in Settings
														</Link>
														.
													</p>
												)}
											</div>
										) : (
											<p className="mt-3 inline-flex items-center gap-2 rounded-sm bg-paper-200 p-3 text-ink-600 text-sm">
												<SpinnerIcon />
												Thinking…
											</p>
										)}
									</li>
								);
							})}
						</ul>
					)}

					<form
						className="mt-6 flex flex-col gap-2 sm:flex-row"
						onSubmit={(e) => {
							e.preventDefault();
							void ask(question);
						}}
					>
						<label className="sr-only" htmlFor={askInputId}>
							Ask a question
						</label>
						<input
							className="flex-1 rounded-full border border-indigo-500/20 bg-paper-200 px-4 py-2.5 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600/60 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
							id={askInputId}
							onChange={(e) => setQuestion(e.target.value)}
							placeholder="Ask a follow-up…"
							type="text"
							value={question}
						/>
						<button
							className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
							disabled={question.trim().length === 0}
							type="submit"
						>
							<SendIcon />
							Ask
						</button>
					</form>

					{messages.length > 0 && (
						<Link
							className="mt-6 inline-flex w-fit items-center gap-1.5 self-center text-ink-600 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
							href="/"
						>
							<BackIcon />
							Back to insights
						</Link>
					)}
				</section>
			</div>
		</main>
	);
}
