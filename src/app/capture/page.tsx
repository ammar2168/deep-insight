"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { CrisisCheckInModal } from "@/app/_components/crisis-check-in-modal";
import type { RouterOutputs } from "@/trpc/react";
import { api } from "@/trpc/react";

type StageId = "sheet" | "crease" | "form";

const STAGES: {
	id: StageId;
	number: string;
	label: string;
	verb: string;
}[] = [
	{ id: "sheet", number: "01", label: "The Flat Sheet", verb: "Capture" },
	{ id: "crease", number: "02", label: "The Crease Sequence", verb: "Correct" },
	{ id: "form", number: "03", label: "The Standing Form", verb: "Confirm" },
];

type Photo = { id: string; name: string; url: string; file: File };

type ExtractedInsight =
	RouterOutputs["entry"]["extractInsights"]["insights"][number];

type Insight = {
	id: string;
	category: ExtractedInsight["category"];
	label: string;
	value: string;
};

function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () =>
			reject(reader.error ?? new Error("Couldn't read file"));
		reader.readAsDataURL(file);
	});
}

function errorMessage(err: unknown, fallback: string) {
	return err instanceof Error && err.message ? err.message : fallback;
}

function FoldIcon({ state }: { state: "pending" | "active" | "locked" }) {
	if (state === "locked") {
		return (
			<svg aria-hidden="true" height="20" viewBox="0 0 20 20" width="20">
				<title>Locked</title>
				<path
					d="M10 2 L18 10 L10 18 L2 10 Z"
					fill="var(--color-gold-500)"
					stroke="var(--color-gold-500)"
					strokeLinejoin="round"
					strokeWidth="1.5"
				/>
				<path
					d="M10 2 L10 18 M2 10 L18 10"
					stroke="var(--color-indigo-900)"
					strokeWidth="1"
				/>
			</svg>
		);
	}
	if (state === "active") {
		return (
			<svg aria-hidden="true" height="20" viewBox="0 0 20 20" width="20">
				<title>In progress</title>
				<path
					d="M10 2 L18 10 L10 18 L2 10 Z"
					fill="none"
					stroke="var(--color-paper-100)"
					strokeLinejoin="round"
					strokeWidth="1.5"
				/>
				<path
					d="M10 2 L10 18"
					stroke="var(--color-paper-100)"
					strokeWidth="1"
				/>
			</svg>
		);
	}
	return (
		<svg aria-hidden="true" height="20" viewBox="0 0 20 20" width="20">
			<title>Not started</title>
			<rect
				height="16"
				stroke="var(--color-indigo-400)"
				strokeWidth="1.25"
				width="16"
				x="2"
				y="2"
			/>
		</svg>
	);
}

function UploadIcon() {
	return (
		<svg aria-hidden="true" height="28" viewBox="0 0 28 28" width="28">
			<title>Add a photo</title>
			<path
				d="M14 5 L14 18 M8 11 L14 5 L20 11"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.75"
			/>
			<path
				d="M4 20 L4 23 L24 23 L24 20"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.75"
			/>
		</svg>
	);
}

function SpinnerIcon() {
	return (
		<svg
			aria-hidden="true"
			className="animate-[spin_0.9s_linear_infinite] motion-reduce:animate-none"
			height="16"
			viewBox="0 0 16 16"
			width="16"
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

function DiscardIcon() {
	return (
		<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
			<title>Discard this insight</title>
			<path
				d="M3 4.5 L13 4.5 M6 4.5 V3 a1 1 0 0 1 1 -1 h2 a1 1 0 0 1 1 1 v1.5 M4.5 4.5 L5 13 a1 1 0 0 0 1 1 h4 a1 1 0 0 0 1 -1 l0.5 -8.5"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.3"
			/>
		</svg>
	);
}

export default function CapturePage() {
	const [stageIndex, setStageIndex] = useState(0);
	const [displayIndex, setDisplayIndex] = useState(0);
	const [transitioning, setTransitioning] = useState(false);
	const [photos, setPhotos] = useState<Photo[]>([]);
	const [entryText, setEntryText] = useState("");
	const [insights, setInsights] = useState<Insight[]>([]);
	const [confirmingDiscardId, setConfirmingDiscardId] = useState<string | null>(
		null,
	);
	const [saved, setSaved] = useState(false);
	const [savedCount, setSavedCount] = useState(0);
	const [extractTextError, setExtractTextError] = useState<string | null>(null);
	const [extractInsightsError, setExtractInsightsError] = useState<
		string | null
	>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [crisisCheckIn, setCrisisCheckIn] = useState(false);
	const uploadInputId = useId();

	const utils = api.useUtils();
	const extractTextMutation = api.entry.extractText.useMutation();
	const extractInsightsMutation = api.entry.extractInsights.useMutation();
	const saveMutation = api.entry.save.useMutation();

	useEffect(() => {
		if (stageIndex === displayIndex) return;
		setTransitioning(true);
		const t = setTimeout(() => {
			setDisplayIndex(stageIndex);
			setTransitioning(false);
		}, 220);
		return () => clearTimeout(t);
	}, [stageIndex, displayIndex]);

	// biome-ignore lint/style/noNonNullAssertion: displayIndex is always clamped to a valid STAGES index
	const stage = STAGES[displayIndex] ?? STAGES[0]!;

	const stageState = (index: number): "pending" | "active" | "locked" => {
		if (index < stageIndex) return "locked";
		if (index === stageIndex) return "active";
		return "pending";
	};

	function addPhotos(files: FileList | null) {
		if (!files) return;
		const next: Photo[] = Array.from(files).map((f) => ({
			id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
			name: f.name,
			url: URL.createObjectURL(f),
			file: f,
		}));
		setPhotos((prev) => [...prev, ...next]);
	}

	function removePhoto(id: string) {
		setPhotos((prev) => prev.filter((p) => p.id !== id));
	}

	async function handleExtractText() {
		setExtractTextError(null);
		try {
			const photoInputs = await Promise.all(
				photos.map(async (p) => ({
					base64: await fileToDataUrl(p.file),
					mediaType: p.file.type,
				})),
			);
			const result = await extractTextMutation.mutateAsync({
				photos: photoInputs,
			});
			setEntryText(result.text);
			if (result.crisis) {
				// Pause here instead of dropping the user straight into an editable box
				// holding their own words back at them; they advance once they continue.
				setCrisisCheckIn(true);
			} else {
				setStageIndex(1);
			}
		} catch (err) {
			// OCR failure still moves forward to manual entry, per product rule: never a dead end.
			setExtractTextError(
				errorMessage(
					err,
					"Couldn't read this automatically — no problem, just type it in below.",
				),
			);
			setEntryText("");
			setStageIndex(1);
		}
	}

	async function handleContinueToInsights() {
		setExtractInsightsError(null);
		try {
			const result = await extractInsightsMutation.mutateAsync({
				text: entryText,
			});
			setInsights(
				result.insights.map((i) => ({
					id: crypto.randomUUID(),
					category: i.category,
					label: i.label,
					value: i.value,
				})),
			);
			setStageIndex(2);
		} catch (err) {
			setExtractInsightsError(
				errorMessage(err, "Couldn't pull insights from that text. Try again?"),
			);
		}
	}

	function handleCrisisContinue() {
		setCrisisCheckIn(false);
		setStageIndex(1);
	}

	function discardInsight(id: string) {
		setInsights((prev) => prev.filter((i) => i.id !== id));
		setConfirmingDiscardId(null);
	}

	async function handleSave() {
		setSaveError(null);
		try {
			const result = await saveMutation.mutateAsync({
				text: entryText,
				insights: insights.map(({ category, label, value }) => ({
					category,
					label,
					value,
				})),
			});
			setSavedCount(result.insightCount);
			setSaved(true);
			await utils.insight.latest.invalidate();
		} catch (err) {
			setSaveError(errorMessage(err, "Couldn't save your entry. Try again?"));
		}
	}

	return (
		<main
			className="relative min-h-screen bg-indigo-700 text-paper-100"
			style={{
				backgroundImage:
					"repeating-linear-gradient(115deg, var(--color-crease) 0px, var(--color-crease) 1px, transparent 1px, transparent 96px)",
			}}
		>
			{crisisCheckIn && (
				<CrisisCheckInModal onContinue={handleCrisisContinue} />
			)}

			<div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12 sm:px-10 sm:py-16">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-indigo-400 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
					href="/"
				>
					<BackIcon />
					Home
				</Link>

				<header className="flex items-baseline justify-between border-indigo-500 border-b pb-6">
					<div>
						<p className="font-mono text-indigo-400 text-xs uppercase tracking-[0.2em]">
							One entry, one date
						</p>
						<h1 className="mt-1 font-semibold text-2xl text-paper-100 sm:text-3xl">
							Add today&rsquo;s page
						</h1>
					</div>
					<p className="hidden max-w-xs text-right text-indigo-400 text-sm sm:block">
						Every photo you add here folds into one entry for today, then
						unfolds into a handful of insights.
					</p>
				</header>

				<div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_1fr] sm:gap-12">
					{/* Numbered margin rail: compact dot strip on mobile, full margin column from sm up */}
					<ol className="flex items-center justify-center gap-3 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0">
						{STAGES.map((s, i) => {
							const state = stageState(i);
							const isLast = i === STAGES.length - 1;
							return (
								<li
									className="flex items-center gap-3 sm:items-start"
									key={s.id}
								>
									<div className="flex items-center sm:flex-col">
										<FoldIcon state={state} />
										{!isLast && (
											<div
												aria-hidden="true"
												className="mx-2 h-px w-6 sm:mx-0 sm:mt-1 sm:h-auto sm:min-h-10 sm:w-px sm:flex-1"
												style={{
													background:
														state === "locked"
															? "var(--color-gold-500)"
															: "var(--color-indigo-500)",
												}}
											/>
										)}
									</div>
									<div className="hidden pb-10 sm:block">
										<p className="font-mono text-indigo-400 text-xs">
											{s.number}
										</p>
										<p
											className={`font-medium text-sm ${
												state === "pending"
													? "text-indigo-400"
													: "text-paper-100"
											}`}
										>
											{s.label}
										</p>
										<p className="text-indigo-400 text-xs">{s.verb}</p>
									</div>
								</li>
							);
						})}
					</ol>

					{/* Working panel: paper surface */}
					<div
						className={`rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] transition-[transform,opacity] duration-200 ease-out sm:p-8 ${
							transitioning
								? "-translate-y-1 opacity-0"
								: "translate-y-0 opacity-100"
						} motion-reduce:transition-none`}
					>
						<p className="font-mono text-ink-600 text-xs uppercase tracking-[0.15em]">
							{stage.number} · {stage.verb}
						</p>
						<h2 className="mt-1 font-semibold text-ink-900 text-xl">
							{stage.label}
						</h2>

						{stage.id === "sheet" && (
							<section
								aria-label="Add photos"
								className="mt-6 flex flex-col gap-5"
							>
								<label
									className="flex cursor-pointer flex-col items-center gap-2 rounded-sm border border-indigo-500/40 border-dashed px-6 py-10 text-center text-ink-600 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/50 hover:border-indigo-500 hover:bg-paper-200"
									htmlFor={uploadInputId}
								>
									<UploadIcon />
									<span className="font-medium text-ink-900 text-sm">
										Add a photo of a page
									</span>
									<span className="text-xs">
										Add every page from today&rsquo;s session before you
										extract.
									</span>
									<input
										accept="image/*"
										capture="environment"
										className="sr-only"
										id={uploadInputId}
										multiple
										onChange={(e) => addPhotos(e.target.files)}
										type="file"
									/>
								</label>

								{photos.length === 0 ? (
									<p className="text-ink-600 text-sm italic">
										No pages added yet.
									</p>
								) : (
									<ul className="flex flex-wrap gap-3">
										{photos.map((p) => (
											<li className="group relative" key={p.id}>
												{/* biome-ignore lint/performance/noImgElement: object URLs from local file input */}
												<img
													alt={p.name}
													className="h-20 w-20 rounded-sm border border-indigo-500/30 object-cover"
													src={p.url}
												/>
												<button
													aria-label={`Remove ${p.name}`}
													className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-indigo-500/40 bg-paper-100 text-ink-600 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
													onClick={() => removePhoto(p.id)}
													type="button"
												>
													×
												</button>
											</li>
										))}
									</ul>
								)}

								<div className="flex justify-end">
									<button
										className="inline-flex items-center gap-2 rounded-sm bg-indigo-600 px-5 py-2.5 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
										disabled={
											photos.length === 0 || extractTextMutation.isPending
										}
										onClick={handleExtractText}
										type="button"
									>
										{extractTextMutation.isPending && <SpinnerIcon />}
										{extractTextMutation.isPending
											? "Folding text out of the page…"
											: "Extract text"}
									</button>
								</div>
							</section>
						)}

						{stage.id === "crease" && (
							<section
								aria-label="Review and edit extracted text"
								className="mt-6 flex flex-col gap-5"
							>
								{extractTextError && (
									<p className="rounded-sm bg-paper-200 p-3 text-ink-600 text-sm">
										{extractTextError}
									</p>
								)}

								<textarea
									aria-label="Entry text"
									className="min-h-40 resize-y rounded-sm border border-indigo-500/20 bg-paper-200 p-4 text-[15px] text-ink-900 leading-relaxed transition-colors focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
									onChange={(e) => setEntryText(e.target.value)}
									placeholder="Type what you wrote today…"
									value={entryText}
								/>

								<p className="text-ink-600 text-xs">
									Read it over and fix anything that came out wrong — OCR
									isn&rsquo;t always perfect.
								</p>

								{extractInsightsError && (
									<p className="rounded-sm bg-paper-200 p-3 text-ink-600 text-sm">
										{extractInsightsError}
									</p>
								)}

								<div className="flex items-center justify-between">
									<button
										className="text-ink-600 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
										onClick={() => setStageIndex(0)}
										type="button"
									>
										Back to pages
									</button>
									<button
										className="inline-flex items-center gap-2 rounded-sm bg-indigo-600 px-5 py-2.5 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
										disabled={
											entryText.trim().length === 0 ||
											extractInsightsMutation.isPending
										}
										onClick={handleContinueToInsights}
										type="button"
									>
										{extractInsightsMutation.isPending && <SpinnerIcon />}
										{extractInsightsMutation.isPending
											? "Reading for signal…"
											: "Continue to insights"}
									</button>
								</div>
							</section>
						)}

						{stage.id === "form" && (
							<section
								aria-label="Review and save insights"
								className="mt-6 flex flex-col gap-5"
							>
								{saved ? (
									<div className="flex flex-col items-center gap-4 py-8 text-center">
										<FoldIcon state="locked" />
										<p className="font-medium text-ink-900">
											{savedCount} insight{savedCount === 1 ? "" : "s"} saved.
										</p>
										<p className="max-w-xs text-ink-600 text-sm">
											You&rsquo;ll see these again next time you log in,
											alongside anything new they connect to.
										</p>
										<Link
											className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
											href="/"
										>
											Back to your insights
										</Link>
									</div>
								) : insights.length === 0 ? (
									<p className="text-ink-600 text-sm italic">
										No insights left to save. Go back and add photos again to
										try once more.
									</p>
								) : (
									<>
										{saveError && (
											<p className="rounded-sm bg-paper-200 p-3 text-ink-600 text-sm">
												{saveError}
											</p>
										)}

										<ul className="flex flex-col gap-3">
											{insights.map((insight) =>
												confirmingDiscardId === insight.id ? (
													<li
														className="flex items-center justify-between gap-4 rounded-sm border border-indigo-500/40 bg-paper-200 p-4"
														key={insight.id}
													>
														<p className="font-medium text-ink-900 text-sm">
															Remove &ldquo;{insight.label}&rdquo;?
														</p>
														<div className="flex shrink-0 gap-2">
															<button
																className="rounded-full px-3 py-1.5 font-medium text-ink-600 text-xs transition-colors hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
																onClick={() => setConfirmingDiscardId(null)}
																type="button"
															>
																Keep
															</button>
															<button
																className="rounded-full bg-indigo-600 px-3 py-1.5 font-medium text-paper-100 text-xs transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
																onClick={() => discardInsight(insight.id)}
																type="button"
															>
																Remove
															</button>
														</div>
													</li>
												) : (
													<li
														className="flex items-start justify-between gap-4 rounded-sm border border-indigo-500/20 bg-paper-200 p-4 transition-colors"
														key={insight.id}
													>
														<div>
															<p className="font-medium text-ink-900 text-sm">
																{insight.label}
															</p>
															<p className="text-ink-600 text-sm">
																{insight.value}
															</p>
														</div>
														<button
															aria-label={`Discard ${insight.label} insight`}
															className="shrink-0 rounded-sm border border-indigo-500/40 p-2 text-ink-600 transition-colors hover:border-indigo-500 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
															onClick={() => setConfirmingDiscardId(insight.id)}
															type="button"
														>
															<DiscardIcon />
														</button>
													</li>
												),
											)}
										</ul>

										<div className="flex items-center justify-between">
											<button
												className="text-ink-600 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
												onClick={() => setStageIndex(1)}
												type="button"
											>
												Back to text
											</button>
											<button
												className="inline-flex items-center gap-2 rounded-sm bg-gold-500 px-5 py-2.5 font-medium text-ink-900 text-sm transition-colors hover:bg-gold-500/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-900 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
												disabled={saveMutation.isPending}
												onClick={handleSave}
												type="button"
											>
												{saveMutation.isPending && <SpinnerIcon />}
												{saveMutation.isPending ? "Saving…" : "Save entry"}
											</button>
										</div>
									</>
								)}
							</section>
						)}
					</div>
				</div>
			</div>
		</main>
	);
}
