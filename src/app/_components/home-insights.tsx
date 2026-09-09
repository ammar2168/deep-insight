"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { api } from "@/trpc/react";

function AskIcon() {
	return (
		<svg aria-hidden="true" height="20" viewBox="0 0 20 20" width="20">
			<title>Ask a question</title>
			<path
				d="M3 4.5 h14 a1 1 0 0 1 1 1 v7 a1 1 0 0 1 -1 1 h-8 l-3.5 3 v-3 h-2.5 a1 1 0 0 1 -1 -1 v-7 a1 1 0 0 1 1 -1 Z"
				fill="none"
				stroke="currentColor"
				strokeLinejoin="round"
				strokeWidth="1.4"
			/>
		</svg>
	);
}

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

export function HomeInsights() {
	const [insights] = api.insight.latest.useSuspenseQuery();
	const [lead, ...rest] = insights;
	const askInputId = useId();
	const [question, setQuestion] = useState("");
	const router = useRouter();

	return (
		<div className="flex flex-col gap-6">
			<section
				aria-label="Latest insights"
				className="animate-[fold-in_0.5s_ease-out_backwards] rounded-sm bg-paper-100 p-6 shadow-[0_14px_34px_-18px_rgba(0,0,0,0.55)] sm:p-8"
			>
				<p className="font-mono text-ink-600 text-xs uppercase tracking-[0.2em]">
					Latest insights
				</p>

				{insights.length === 0 || !lead ? (
					<p className="mt-4 text-ink-600 text-sm italic">
						Nothing here yet — add your first page above to see what surfaces.
					</p>
				) : (
					<>
						<p className="mt-3 font-semibold text-2xl text-ink-900 leading-snug sm:text-3xl">
							<span className="text-indigo-600">{lead.label}: </span>
							{lead.value}
						</p>

						{rest.length > 0 && (
							<ul className="mt-6 flex flex-wrap gap-2">
								{rest.map((insight, i) => (
									<li
										className="max-w-full animate-[fold-in_0.4s_ease-out_backwards] rounded-full bg-paper-200 px-4 py-2 text-sm motion-reduce:animate-none"
										key={insight.id}
										style={{ animationDelay: `${(i + 1) * 70}ms` }}
									>
										<span className="font-medium text-ink-900">
											{insight.label}
										</span>
										<span className="text-ink-600"> — {insight.value}</span>
									</li>
								))}
							</ul>
						)}
					</>
				)}
			</section>

			<section
				aria-label="Ask about your insights"
				className="flex flex-col gap-3 rounded-sm bg-paper-100 p-5 shadow-[0_14px_34px_-18px_rgba(0,0,0,0.55)] sm:p-6"
			>
				<div className="flex items-center gap-2 text-ink-900">
					<AskIcon />
					<p className="font-medium text-sm">Go deeper</p>
				</div>
				<p className="text-ink-600 text-sm">
					Ask about your mood, sleep, or progress over time — build on the
					answer with follow-up questions.
				</p>
				<form
					className="flex flex-col gap-2 sm:flex-row"
					onSubmit={(e) => {
						e.preventDefault();
						const q = question.trim();
						router.push(q ? `/chat?q=${encodeURIComponent(q)}` : "/chat");
					}}
				>
					<label className="sr-only" htmlFor={askInputId}>
						Ask a question
					</label>
					<input
						className="flex-1 rounded-full border border-indigo-500/20 bg-paper-200 px-4 py-2.5 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600/60 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
						id={askInputId}
						onChange={(e) => setQuestion(e.target.value)}
						placeholder="How's my mood been lately?"
						type="text"
						value={question}
					/>
					<button
						className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
						type="submit"
					>
						<SendIcon />
						Ask
					</button>
				</form>
			</section>
		</div>
	);
}
