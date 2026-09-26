"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

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
import {
	type DateFailure,
	groupConsecutiveByDate,
	resolveEntryDate,
} from "@/lib/entry-date";
import { errorMessage } from "@/lib/error-message";
import { api, type RouterOutputs } from "@/trpc/react";

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

type PhotoItem = {
	photo: Photo;
	text: string;
	date: string | null;
	/** Why there's no date, so the question asked can say which problem it is. */
	reason: DateFailure | null;
};

type GroupResult =
	| {
			/** Stable across renders; two entries can share one date. */
			id: string;
			date: string;
			status: "saved";
			pageCount: number;
			insightCount: number;
			manualDate: boolean;
			/** Saved, but the insight step failed — the page itself is safe. */
			insightsFailed: boolean;
	  }
	| {
			id: string;
			date: string;
			status: "failed";
			pageCount: number;
			reason: string;
	  };

type Phase =
	| { kind: "select" }
	| { kind: "processing"; stage: "reading" | "saving" }
	| {
			kind: "need-date";
			item: PhotoItem;
			position: number;
			total: number;
			suggestion: string | null;
			/** Already banked before this question was asked. */
			savedPages: number;
			savedDays: number;
	  }
	| {
			kind: "summary";
			results: GroupResult[];
			skipped: string[];
			totalPages: number;
			manualPages: number;
	  };

/**
 * Three passes, in this order for a reason:
 *   1. Read every page. Nothing blocks — one unreadable or undated page can't
 *      hold up the other forty-nine.
 *   2. Save every page that already knows its own date, grouping consecutive
 *      pages that share one into a single entry.
 *   3. Only then ask about whatever's left, with the totals already banked so
 *      the question arrives as "42 pages saved, 8 need a date" rather than an
 *      interrogation before anything has happened.
 *
 * A page's date comes from the page itself first and its filename second (see
 * src/lib/entry-date.ts), and is never inferred from a neighbouring page.
 */
/** Narrows to pages that actually have a date, without a non-null assertion. */
function datedPagesOf(items: PhotoItem[]): { date: string; text: string }[] {
	return items.flatMap((item) =>
		item.date === null ? [] : [{ date: item.date, text: item.text }],
	);
}

function savedPagesIn(results: GroupResult[]): number {
	return results.reduce(
		(total, r) => (r.status === "saved" ? total + r.pageCount : total),
		0,
	);
}

function savedDaysIn(results: GroupResult[]): number {
	return results.filter((r) => r.status === "saved").length;
}

/**
 * The nearest already-dated page before this one, offered as a pre-fill only.
 * Multi-page entries often only date the first page, so it's usually right —
 * but it is shown and confirmed, never applied on its own.
 */
function suggestionFor(items: PhotoItem[], item: PhotoItem): string | null {
	for (let i = items.indexOf(item) - 1; i >= 0; i--) {
		const date = items[i]?.date;
		if (date) return date;
	}
	return null;
}

export default function BatchCapturePage() {
	const [photos, setPhotos] = useState<Photo[]>([]);
	const [phase, setPhase] = useState<Phase>({ kind: "select" });
	const [progress, setProgress] = useState({ current: 0, total: 0 });
	const [completed, setCompleted] = useState<GroupResult[]>([]);
	const [pickError, setPickError] = useState<string | null>(null);
	const [showCrisisModal, setShowCrisisModal] = useState(false);

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

	function waitForManualDate(
		item: PhotoItem,
		position: number,
		total: number,
		suggestion: string | null,
		savedPages: number,
		savedDays: number,
	): Promise<string> {
		return new Promise((resolve) => {
			dateResolveRef.current = resolve;
			setPhase({
				kind: "need-date",
				item,
				position,
				total,
				suggestion,
				savedPages,
				savedDays,
			});
		});
	}

	function submitManualDate(date: string) {
		// No phase change here: the loop either shows the next question or
		// moves on to saving, so there's nothing to flash in between.
		dateResolveRef.current?.(date);
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
		setPhase({ kind: "processing", stage: "reading" });
		setCompleted([]);
		const today = getLocalDateString();
		const items: PhotoItem[] = [];
		const skipped: string[] = [];

		// Pass 1 — read every page.
		for (let i = 0; i < photos.length; i++) {
			// biome-ignore lint/style/noNonNullAssertion: i is always a valid index into photos
			const photo = photos[i]!;
			setProgress({ current: i + 1, total: photos.length });

			let ocr: RouterOutputs["entry"]["extractText"];
			try {
				const base64 = await fileToCompressedDataUrl(photo.file);
				ocr = await extractTextMutation.mutateAsync({
					photos: [{ base64, mediaType: "image/jpeg" }],
				});
			} catch {
				skipped.push(photo.name);
				continue;
			}

			if (ocr.crisis) {
				await waitForCrisisContinue();
			}

			const resolution = resolveEntryDate({
				mentionedDates: ocr.mentionedDates,
				filename: photo.name,
				today,
			});
			items.push({
				photo,
				text: ocr.text,
				date: resolution.date,
				reason: resolution.reason ?? null,
			});
		}

		const results: GroupResult[] = [];

		/**
		 * Groups consecutive pages sharing a date into one entry and saves it.
		 * Insight extraction is deliberately inside its own try: a page that was
		 * read successfully is never discarded because insights failed.
		 */
		async function saveGrouped(
			list: { date: string; text: string }[],
			manualDate: boolean,
		) {
			for (const group of groupConsecutiveByDate(list)) {
				const { date } = group;
				const texts = group.items.map((item) => item.text);
				const text = texts.join("\n\n");
				const id = `${date}#${results.length}`;
				let result: GroupResult;
				try {
					let insights: RouterOutputs["entry"]["extractInsights"]["insights"] =
						[];
					let insightsFailed = false;
					try {
						const extracted = await extractInsightsMutation.mutateAsync({
							text,
						});
						insights = extracted.insights;
					} catch {
						insightsFailed = true;
					}
					await saveMutation.mutateAsync({ text, entryDate: date, insights });
					result = {
						id,
						date,
						status: "saved",
						pageCount: texts.length,
						insightCount: insights.length,
						manualDate,
						insightsFailed,
					};
				} catch (err) {
					result = {
						id,
						date,
						status: "failed",
						pageCount: texts.length,
						reason: errorMessage(err, "Something went wrong saving this one."),
					};
				}
				results.push(result);
				setCompleted((prev) => [...prev, result]);
			}
		}

		// Pass 2 — bank everything that already knows its date.
		setPhase({ kind: "processing", stage: "saving" });
		await saveGrouped(datedPagesOf(items), false);

		// Pass 3 — now ask about the rest, one at a time, nothing else waiting.
		const undated = items.filter((item) => item.date === null);
		const answered: PhotoItem[] = [];
		for (let n = 0; n < undated.length; n++) {
			// biome-ignore lint/style/noNonNullAssertion: n is always a valid index into undated
			const item = undated[n]!;
			const chosen = await waitForManualDate(
				item,
				n + 1,
				undated.length,
				suggestionFor(items, item),
				savedPagesIn(results),
				savedDaysIn(results),
			);
			answered.push({ ...item, date: chosen });
		}

		if (answered.length > 0) {
			setPhase({ kind: "processing", stage: "saving" });
			await saveGrouped(datedPagesOf(answered), true);
		}

		setPhase({
			kind: "summary",
			results,
			skipped,
			totalPages: photos.length,
			manualPages: undated.length,
		});
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
								Add every page, in the order they were written. We'll look for a
								date on each page — if we can't find one, we'll ask once
								everything else is sorted.{" "}
								<Link
									className="underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100"
									href="/capture"
								>
									Just one day?
								</Link>
							</p>
						</header>

						<section className="rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
							<div className="mb-6 flex flex-col gap-1.5 rounded-sm bg-paper-200 p-4">
								<p className="font-mono text-[11px] text-ink-600 uppercase tracking-wide">
									For the smoothest results
								</p>
								<p className="text-ink-600 text-sm">
									Write the date somewhere on each page you photograph. That's
									the first thing we look for, and the most reliable.
								</p>
								<p className="text-ink-600 text-sm">
									A filename works too, if you chose it yourself —{" "}
									<span className="font-mono text-ink-900">2024-09-02</span> or
									"2 Sep 2024". Names your camera picked, like{" "}
									<span className="font-mono text-ink-900">IMG_20260925</span>,
									only record when the photo was taken, so we ignore them.
								</p>
							</div>

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
								{phase.stage === "reading" ? (
									<>
										Reading page{" "}
										<span className="font-mono tabular-nums">
											{progress.current}
										</span>{" "}
										of{" "}
										<span className="font-mono tabular-nums">
											{progress.total}
										</span>
									</>
								) : (
									"Saving your entries…"
								)}
							</p>
						</div>
						<p className="mt-2 text-ink-600 text-sm">
							This can take a few minutes for a big batch — keep this tab open,
							and we'll drop you at your insights when it's done.
						</p>

						{completed.length > 0 && (
							<ul className="mt-6 flex flex-col gap-1.5 border-indigo-500/20 border-t pt-4">
								{completed.map((r) => (
									<li className="text-ink-600 text-sm" key={r.id}>
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
					<NeedDateCard
						item={phase.item}
						key={phase.item.photo.id}
						onSubmit={submitManualDate}
						position={phase.position}
						savedDays={phase.savedDays}
						savedPages={phase.savedPages}
						suggestion={phase.suggestion}
						total={phase.total}
					/>
				)}

				{phase.kind === "summary" && (
					<SummaryPanel
						manualPages={phase.manualPages}
						results={phase.results}
						skipped={phase.skipped}
						totalPages={phase.totalPages}
					/>
				)}
			</div>

			{showCrisisModal && (
				<CrisisCheckInModal onContinue={handleCrisisContinue} />
			)}
		</main>
	);
}

function NeedDateCard({
	item,
	position,
	total,
	suggestion,
	savedPages,
	savedDays,
	onSubmit,
}: {
	item: PhotoItem;
	position: number;
	total: number;
	suggestion: string | null;
	savedPages: number;
	savedDays: number;
	onSubmit: (date: string) => void;
}) {
	const [date, setDate] = useState(suggestion ?? "");
	const dateInputId = useId();

	return (
		<section className="rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
			<p className="font-mono text-ink-600 text-xs uppercase tracking-[0.2em]">
				{total === 1
					? "One page needs a date"
					: `Page ${position} of ${total} without a date`}
			</p>
			<h2 className="mt-2 font-semibold text-ink-900 text-lg">
				What date is this page?
			</h2>
			<p className="mt-1 text-ink-600 text-sm">
				{savedPages > 0 &&
					`${savedPages} ${savedPages === 1 ? "page is" : "pages are"} already saved across ${savedDays} ${savedDays === 1 ? "day" : "days"}. `}
				{item.reason === "ambiguous-page"
					? "This page names more than one date, so we won't choose between them."
					: "We couldn't find a date written on the page, and its filename isn't one you chose."}
			</p>

			<div className="mt-4 flex flex-col gap-4 sm:flex-row">
				{/* biome-ignore lint/performance/noImgElement: object URL from local file input */}
				<img
					alt={item.photo.name}
					className="h-48 w-40 shrink-0 rounded-sm border border-indigo-500/30 object-cover"
					src={item.photo.url}
				/>
				<div className="max-h-48 overflow-y-auto rounded-sm bg-paper-200 p-3 text-ink-600 text-sm">
					{item.text || "No text could be read from this page."}
				</div>
			</div>

			<div className="mt-4 flex flex-col gap-1.5">
				<label
					className="font-mono text-[11px] text-ink-600 uppercase tracking-wide"
					htmlFor={dateInputId}
				>
					Date
				</label>
				<input
					className="w-fit rounded-sm border border-indigo-500/20 bg-paper-200 px-3 py-2 text-[15px] text-ink-900 transition-colors focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
					id={dateInputId}
					max={getLocalDateString()}
					onChange={(e) => setDate(e.target.value)}
					type="date"
					value={date}
				/>
				{suggestion && date === suggestion && (
					<p className="text-ink-600 text-xs">
						Pre-filled with the date from the page before it — change it if
						that's not right.
					</p>
				)}
			</div>

			<div className="mt-5 flex justify-end">
				<button
					className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
					disabled={!date}
					onClick={() => onSubmit(date)}
					type="button"
				>
					Continue
				</button>
			</div>
		</section>
	);
}

function SummaryPanel({
	results,
	skipped,
	totalPages,
	manualPages,
}: {
	results: GroupResult[];
	skipped: string[];
	totalPages: number;
	manualPages: number;
}) {
	const saved = results.filter((r) => r.status === "saved");
	const failed = results.filter((r) => r.status === "failed");
	const savedPages = savedPagesIn(results);
	const failedPages = results.reduce(
		(total, r) => (r.status === "failed" ? total + r.pageCount : total),
		0,
	);
	const noInsightCount = saved.filter(
		(r) => r.status === "saved" && r.insightsFailed,
	).length;
	// A page dated by hand can land on a day that was already saved, which is
	// a second entry for that date — real, but one day, not two.
	const distinctDays = new Set(saved.map((r) => r.date)).size;

	// Pages in, pages out, and every exception named. The old summary counted
	// only days, so a run where 50 pages collapsed into one day reported
	// "every page came through cleanly" — true by its own definition, and
	// useless for noticing that something had gone wrong.
	const notes = [
		manualPages > 0 &&
			`${manualPages} ${manualPages === 1 ? "page" : "pages"} you dated yourself`,
		skipped.length > 0 &&
			`${skipped.length} ${skipped.length === 1 ? "page" : "pages"} couldn't be read`,
		failedPages > 0 &&
			`${failedPages} ${failedPages === 1 ? "page" : "pages"} couldn't be saved`,
		noInsightCount > 0 &&
			`${noInsightCount} ${noInsightCount === 1 ? "day" : "days"} saved without insights — the writing is safe`,
	].filter((note): note is string => typeof note === "string");

	return (
		<section className="rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
			<h2 className="font-semibold text-2xl text-ink-900">
				{savedPages} of {totalPages} {totalPages === 1 ? "page" : "pages"} saved
				across {distinctDays} {distinctDays === 1 ? "day" : "days"}
			</h2>
			{notes.length > 0 ? (
				<ul className="mt-2 flex flex-col gap-1">
					{notes.map((note) => (
						<li className="text-ink-600 text-sm" key={note}>
							{note}
						</li>
					))}
				</ul>
			) : (
				<p className="mt-1 text-ink-600 text-sm">
					Every page carried its own date and came through cleanly.
				</p>
			)}

			{failed.length > 0 && (
				<div className="mt-4 flex flex-col gap-1.5 border-indigo-500/20 border-t pt-4">
					<p className="font-mono text-[11px] text-ink-600 uppercase tracking-wide">
						Needs another look
					</p>
					{failed.map((r) => (
						<p className="text-ink-600 text-sm" key={r.id}>
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
