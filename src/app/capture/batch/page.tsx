"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { CrisisCheckInModal } from "@/app/_components/crisis-check-in-modal";
import {
	createPhotosFromFiles,
	fileToCompressedDataUrl,
	formatEntryDate,
	getLocalDateString,
	type Photo,
	PhotoPicker,
	SpinnerIcon,
} from "@/app/_components/day-capture";
import { errorMessage } from "@/lib/error-message";
import { api } from "@/trpc/react";

const MAX_PHOTOS = 50;

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

type GroupResult =
	| { date: string; status: "saved"; insightCount: number; manualDate: boolean }
	| { date: string; status: "failed"; reason: string };

type Phase =
	| { kind: "select" }
	| { kind: "processing" }
	| { kind: "need-date"; photo: Photo; preview: string }
	| { kind: "summary"; results: GroupResult[]; skipped: string[] };

/**
 * Runs the same extractText -> extractInsights -> save pipeline DayCapture
 * uses, but per photo instead of per pre-grouped day, with no review step in
 * between: OCR alone has to carry the date (each photo's own detected
 * dateline, falling back to "same day as the page before it," falling back to
 * asking) since dates are needed before grouping can even happen — there's no
 * upfront manual grouping step left to lean on here.
 */
export default function BatchCapturePage() {
	const [photos, setPhotos] = useState<Photo[]>([]);
	const [phase, setPhase] = useState<Phase>({ kind: "select" });
	const [progress, setProgress] = useState({ current: 0, total: 0 });
	const [completed, setCompleted] = useState<GroupResult[]>([]);
	const [pickError, setPickError] = useState<string | null>(null);
	const [showCrisisModal, setShowCrisisModal] = useState(false);

	const dateInputRef = useRef<HTMLInputElement>(null);
	const dateResolveRef = useRef<((date: string) => void) | null>(null);
	const crisisResolveRef = useRef<(() => void) | null>(null);

	const extractTextMutation = api.entry.extractText.useMutation();
	const extractInsightsMutation = api.entry.extractInsights.useMutation();
	const saveMutation = api.entry.save.useMutation();

	function addPhotos(files: FileList | null) {
		if (!files) return;
		setPickError(null);
		const next = createPhotosFromFiles(files);
		setPhotos((prev) => {
			const combined = [...prev, ...next];
			if (combined.length > MAX_PHOTOS) {
				setPickError(
					`Up to ${MAX_PHOTOS} pages at a time — you've added ${combined.length}. Remove a few, or run the rest as a second batch.`,
				);
			}
			return combined;
		});
	}

	function removePhoto(id: string) {
		setPhotos((prev) => {
			const next = prev.filter((p) => p.id !== id);
			if (next.length <= MAX_PHOTOS) setPickError(null);
			return next;
		});
	}

	function waitForManualDate(photo: Photo, preview: string): Promise<string> {
		return new Promise((resolve) => {
			dateResolveRef.current = resolve;
			setPhase({ kind: "need-date", photo, preview });
		});
	}

	function submitManualDate() {
		const value = dateInputRef.current?.value;
		if (!value) return;
		setPhase({ kind: "processing" });
		dateResolveRef.current?.(value);
		dateResolveRef.current = null;
	}

	function waitForCrisisContinue(): Promise<void> {
		return new Promise((resolve) => {
			crisisResolveRef.current = resolve;
			setShowCrisisModal(true);
		});
	}

	function handleCrisisContinue() {
		setShowCrisisModal(false);
		crisisResolveRef.current?.();
		crisisResolveRef.current = null;
	}

	async function runPipeline() {
		setPhase({ kind: "processing" });
		setCompleted([]);
		const results: GroupResult[] = [];
		const skipped: string[] = [];
		let currentGroup: {
			date: string;
			texts: string[];
			manualDate: boolean;
		} | null = null;
		let lastResolvedDate: string | null = null;

		async function finalizeGroup() {
			if (!currentGroup) return;
			const { date, texts, manualDate } = currentGroup;
			const text = texts.join("\n\n");
			let result: GroupResult;
			try {
				const { insights } = await extractInsightsMutation.mutateAsync({
					text,
				});
				await saveMutation.mutateAsync({ text, entryDate: date, insights });
				result = {
					date,
					status: "saved",
					insightCount: insights.length,
					manualDate,
				};
			} catch (err) {
				result = {
					date,
					status: "failed",
					reason: errorMessage(err, "Something went wrong saving this one."),
				};
			}
			results.push(result);
			setCompleted((prev) => [...prev, result]);
			currentGroup = null;
		}

		for (let i = 0; i < photos.length; i++) {
			// biome-ignore lint/style/noNonNullAssertion: i is always a valid index into photos
			const photo = photos[i]!;
			setProgress({ current: i + 1, total: photos.length });

			let text: string;
			let mentionedDates: { rawText: string; resolvedDate: string }[];
			let crisis: boolean;
			try {
				const base64 = await fileToCompressedDataUrl(photo.file);
				const ocr = await extractTextMutation.mutateAsync({
					photos: [{ base64, mediaType: "image/jpeg" }],
				});
				text = ocr.text;
				mentionedDates = ocr.mentionedDates;
				crisis = ocr.crisis;
			} catch {
				skipped.push(photo.name);
				continue;
			}

			if (crisis) {
				await waitForCrisisContinue();
			}

			let resolvedDate: string;
			let manualDate = false;
			const detected = mentionedDates[0]?.resolvedDate;
			if (detected) {
				resolvedDate = detected;
			} else if (lastResolvedDate) {
				resolvedDate = lastResolvedDate;
			} else {
				resolvedDate = await waitForManualDate(photo, text);
				manualDate = true;
			}
			lastResolvedDate = resolvedDate;

			if (currentGroup && currentGroup.date === resolvedDate) {
				currentGroup.texts.push(text);
				if (manualDate) currentGroup.manualDate = true;
			} else {
				await finalizeGroup();
				currentGroup = { date: resolvedDate, texts: [text], manualDate };
			}
		}
		await finalizeGroup();
		setPhase({ kind: "summary", results, skipped });
	}

	const canProcess = photos.length > 0 && photos.length <= MAX_PHOTOS;

	return (
		<main
			className="relative min-h-screen bg-indigo-700 text-paper-100"
			style={{
				backgroundImage:
					"repeating-linear-gradient(115deg, var(--color-crease) 0px, var(--color-crease) 1px, transparent 1px, transparent 96px)",
			}}
		>
			<div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12 sm:px-10 sm:py-16">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-indigo-400 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 focus-visible:outline-offset-2"
					href="/"
				>
					<BackIcon />
					Home
				</Link>

				{phase.kind === "select" && (
					<>
						<header className="flex flex-col gap-2 border-indigo-500 border-b pb-6">
							<p className="font-mono text-indigo-400 text-xs uppercase tracking-[0.2em]">
								Catching up
							</p>
							<h1 className="mt-1 font-semibold text-2xl text-paper-100 sm:text-3xl">
								Add several days at once
							</h1>
							<p className="text-indigo-400 text-sm">
								Add every page, in the order they were written. If a page has
								its date written on it, we'll sort it out automatically —
								otherwise we'll ask.{" "}
								<Link
									className="underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100"
									href="/capture"
								>
									Just one day?
								</Link>
							</p>
						</header>

						<section className="rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
							<PhotoPicker
								hint="Every page, in order."
								label="Add pages"
								onAdd={addPhotos}
								onRemove={removePhoto}
								photos={photos}
							/>
							{pickError && (
								<p className="mt-4 text-ink-600 text-sm">{pickError}</p>
							)}
						</section>

						<div className="flex justify-end">
							<button
								className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
								disabled={!canProcess}
								onClick={runPipeline}
								type="button"
							>
								Process {photos.length || ""}{" "}
								{photos.length === 1 ? "page" : "pages"}
							</button>
						</div>
					</>
				)}

				{phase.kind === "processing" && (
					<section className="rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
						<div className="flex items-center gap-3 text-ink-900">
							<SpinnerIcon />
							<p className="font-medium text-sm">
								Processing page{" "}
								<span className="font-mono tabular-nums">
									{progress.current}
								</span>{" "}
								of{" "}
								<span className="font-mono tabular-nums">{progress.total}</span>
							</p>
						</div>
						<p className="mt-2 text-ink-600 text-sm">
							This can take a few minutes for a big batch — keep this tab open,
							and we'll drop you at your insights when it's done.
						</p>

						{completed.length > 0 && (
							<ul className="mt-6 flex flex-col gap-1.5 border-indigo-500/20 border-t pt-4">
								{completed.map((r) => (
									<li
										className="text-ink-600 text-sm"
										key={`${r.date}-${r.status}`}
									>
										{formatEntryDate(r.date)} —{" "}
										{r.status === "saved" ? (
											<span className="text-ink-900">
												{r.insightCount}{" "}
												{r.insightCount === 1 ? "insight" : "insights"} saved
											</span>
										) : (
											"couldn't be saved"
										)}
									</li>
								))}
							</ul>
						)}
					</section>
				)}

				{phase.kind === "need-date" && (
					<section className="rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
						<h2 className="font-semibold text-ink-900 text-lg">
							What date is this page?
						</h2>
						<p className="mt-1 text-ink-600 text-sm">
							We couldn't find a date on it, and there's no earlier page to
							assume it continues from.
						</p>

						<div className="mt-4 flex flex-col gap-4 sm:flex-row">
							{/* biome-ignore lint/performance/noImgElement: object URL from local file input */}
							<img
								alt={phase.photo.name}
								className="h-48 w-40 shrink-0 rounded-sm border border-indigo-500/30 object-cover"
								src={phase.photo.url}
							/>
							<div className="max-h-48 overflow-y-auto rounded-sm bg-paper-200 p-3 text-ink-600 text-sm">
								{phase.preview || "No text could be read from this page."}
							</div>
						</div>

						<div className="mt-4 flex flex-col gap-1.5">
							<label
								className="font-mono text-[11px] text-ink-600 uppercase tracking-wide"
								htmlFor="manual-date"
							>
								Date
							</label>
							<input
								className="w-fit rounded-sm border border-indigo-500/20 bg-paper-200 px-3 py-2 text-[15px] text-ink-900 transition-colors focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
								id="manual-date"
								max={getLocalDateString()}
								ref={dateInputRef}
								type="date"
							/>
						</div>

						<div className="mt-5 flex justify-end">
							<button
								className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 focus-visible:outline-offset-2"
								onClick={submitManualDate}
								type="button"
							>
								Continue
							</button>
						</div>
					</section>
				)}

				{phase.kind === "summary" && (
					<SummaryPanel results={phase.results} skipped={phase.skipped} />
				)}
			</div>

			{showCrisisModal && (
				<CrisisCheckInModal onContinue={handleCrisisContinue} />
			)}
		</main>
	);
}

function SummaryPanel({
	results,
	skipped,
}: {
	results: GroupResult[];
	skipped: string[];
}) {
	const saved = results.filter((r) => r.status === "saved");
	const failed = results.filter((r) => r.status === "failed");
	const manualCount = saved.filter(
		(r) => r.status === "saved" && r.manualDate,
	).length;

	return (
		<section className="rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
			<h2 className="font-semibold text-2xl text-ink-900">
				{saved.length} {saved.length === 1 ? "day" : "days"} added
			</h2>
			<p className="mt-1 text-ink-600 text-sm">
				{manualCount > 0 &&
					`${manualCount} needed a date you entered yourself. `}
				{skipped.length > 0 &&
					`${skipped.length} ${skipped.length === 1 ? "page" : "pages"} couldn't be read and ${skipped.length === 1 ? "was" : "were"} skipped. `}
				{failed.length === 0 && manualCount === 0 && skipped.length === 0
					? "Every page came through cleanly."
					: null}
			</p>

			{failed.length > 0 && (
				<div className="mt-4 flex flex-col gap-1.5 border-indigo-500/20 border-t pt-4">
					<p className="font-mono text-[11px] text-ink-600 uppercase tracking-wide">
						Needs another look
					</p>
					{failed.map((r) => (
						<p className="text-ink-600 text-sm" key={r.date}>
							{formatEntryDate(r.date)} — {r.reason}
						</p>
					))}
				</div>
			)}

			{skipped.length > 0 && (
				<div className="mt-4 flex flex-col gap-1.5 border-indigo-500/20 border-t pt-4">
					<p className="font-mono text-[11px] text-ink-600 uppercase tracking-wide">
						Skipped pages
					</p>
					{skipped.map((name) => (
						<p className="text-ink-600 text-sm" key={name}>
							{name} — add it individually from{" "}
							<Link
								className="underline decoration-indigo-500/40 underline-offset-4"
								href="/capture"
							>
								a single day
							</Link>
						</p>
					))}
				</div>
			)}

			<div className="mt-6 flex justify-end">
				<Link
					className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 focus-visible:outline-offset-2"
					href="/"
				>
					Back to your insights
				</Link>
			</div>
		</section>
	);
}
