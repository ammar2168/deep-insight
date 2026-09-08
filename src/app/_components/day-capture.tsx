"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { CrisisCheckInModal } from "@/app/_components/crisis-check-in-modal";
import { errorMessage } from "@/lib/error-message";
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

export type Photo = { id: string; name: string; url: string; file: File };

type ExtractedInsight =
	RouterOutputs["entry"]["extractInsights"]["insights"][number];

type PossibleDuplicate = NonNullable<
	RouterOutputs["entry"]["findPossibleDuplicate"]
>;

type Category = ExtractedInsight["category"];

type Insight = {
	id: string;
	category: Category;
	label: string;
	value: string;
};

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
	{ value: "mood", label: "Mood" },
	{ value: "health", label: "Health" },
	{ value: "goal", label: "Goal" },
	{ value: "sleep", label: "Sleep" },
	{ value: "relationships", label: "Relationships" },
	{ value: "movement", label: "Movement" },
	{ value: "other", label: "Other" },
];

export function createPhotosFromFiles(files: FileList): Photo[] {
	return Array.from(files).map((f) => ({
		id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
		name: f.name,
		url: URL.createObjectURL(f),
		file: f,
	}));
}

const MAX_PHOTO_DIMENSION = 1600;
const PHOTO_JPEG_QUALITY = 0.82;

/**
 * Downscales and re-encodes a photo before it's sent to the server. A real
 * phone photo is often several MB, and base64 adds ~33% on top of that —
 * comfortably enough to exceed Vercel's request body size limit, which fails
 * with a plain-text "Request Entity Too Large" response instead of JSON (the
 * client then chokes trying to parse it). 1600px on the long side is far more
 * than the OCR step needs to read handwriting accurately.
 */
function fileToCompressedDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const objectUrl = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(objectUrl);
			const scale = Math.min(
				1,
				MAX_PHOTO_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight),
			);
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(img.naturalWidth * scale);
			canvas.height = Math.round(img.naturalHeight * scale);
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Couldn't process that photo"));
				return;
			}
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			resolve(canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY));
		};
		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			reject(new Error("Couldn't read that photo"));
		};
		img.src = objectUrl;
	});
}

/** Local calendar date as YYYY-MM-DD — never toISOString(), which converts to UTC first. */
export function getLocalDateString(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/** For display only. Appending a bare time (no "Z"/offset) forces local-midnight
 * parsing instead of UTC-midnight, so the shown day never shifts by one. */
export function formatEntryDate(dateStr: string): string {
	return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
		month: "long",
		day: "numeric",
	});
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

function AddIcon() {
	return (
		<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
			<title>Add an insight</title>
			<path
				d="M8 2.5 V13.5 M2.5 8 H13.5"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth="1.5"
			/>
		</svg>
	);
}

function EditIcon() {
	return (
		<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
			<title>Edit this insight</title>
			<path
				d="M11 2.5 L13.5 5 L5.5 13 L2.5 13.5 L3 10.5 Z"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.3"
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

/** Shared photo dropzone + thumbnail grid — used both by DayCapture's own
 * "sheet" stage and by the batch grouping step's per-day cards. */
export function PhotoPicker({
	photos,
	onAdd,
	onRemove,
	label,
	hint,
}: {
	photos: Photo[];
	onAdd: (files: FileList | null) => void;
	onRemove: (id: string) => void;
	label: string;
	hint: string;
}) {
	const uploadInputId = useId();

	return (
		<div className="flex flex-col gap-5">
			<label
				className="flex cursor-pointer flex-col items-center gap-2 rounded-sm border border-indigo-500/40 border-dashed px-6 py-10 text-center text-ink-600 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/50 hover:border-indigo-500 hover:bg-paper-200"
				htmlFor={uploadInputId}
			>
				<UploadIcon />
				<span className="font-medium text-ink-900 text-sm">{label}</span>
				<span className="text-xs">{hint}</span>
				<input
					accept="image/*"
					capture="environment"
					className="sr-only"
					id={uploadInputId}
					multiple
					onChange={(e) => onAdd(e.target.files)}
					type="file"
				/>
			</label>

			{photos.length === 0 ? (
				<p className="text-ink-600 text-sm italic">No pages added yet.</p>
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
								onClick={() => onRemove(p.id)}
								type="button"
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/**
 * The full sheet -> crease -> form pipeline for exactly one day's worth of
 * photos, from upload through save. Parameterized so it can be used both for
 * today's single-page capture and, looped once per day with a fresh mount
 * (key={dayId}), for catching up on several days in one sitting — the tRPC
 * call shape (extractText -> findPossibleDuplicate -> extractInsights -> save)
 * and everything about the pipeline itself is identical either way, only the
 * header copy, starting photos/date, and what happens after a successful save
 * differ between the two.
 */
export function DayCapture({
	initialPhotos,
	initialDate,
	eyebrow,
	title,
	description,
	headerExtra,
	renderSavedAction,
}: {
	initialPhotos: Photo[];
	initialDate: string;
	eyebrow: string;
	title: string;
	description: string;
	headerExtra?: React.ReactNode;
	renderSavedAction: (savedCount: number) => React.ReactNode;
}) {
	const [stageIndex, setStageIndex] = useState(0);
	const [displayIndex, setDisplayIndex] = useState(0);
	const [transitioning, setTransitioning] = useState(false);
	const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
	const [entryText, setEntryText] = useState("");
	const [entryDate, setEntryDate] = useState(initialDate);
	const [detectedDate, setDetectedDate] = useState<string | null>(null);
	const [multiDayDates, setMultiDayDates] = useState<string[] | null>(null);
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
	const [possibleDuplicate, setPossibleDuplicate] =
		useState<PossibleDuplicate | null>(null);
	const [checkingDuplicate, setCheckingDuplicate] = useState(false);
	const [addingInsight, setAddingInsight] = useState(false);
	const [editingInsightId, setEditingInsightId] = useState<string | null>(null);
	const [newCategory, setNewCategory] = useState<Category>("mood");
	const [newLabel, setNewLabel] = useState("");
	const [newValue, setNewValue] = useState("");
	const entryDateId = useId();
	const newCategoryId = useId();
	const newLabelId = useId();
	const newValueId = useId();

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
		setPhotos((prev) => [...prev, ...createPhotosFromFiles(files)]);
	}

	function removePhoto(id: string) {
		setPhotos((prev) => prev.filter((p) => p.id !== id));
	}

	async function handleExtractText() {
		setExtractTextError(null);
		setDetectedDate(null);
		setMultiDayDates(null);
		try {
			const photoInputs = await Promise.all(
				photos.map(async (p) => ({
					base64: await fileToCompressedDataUrl(p.file),
					// Always JPEG now, regardless of the source file's original
					// format — that's what the canvas re-encode above actually
					// produces, and it's what the bytes being sent really are.
					mediaType: "image/jpeg",
				})),
			);
			const result = await extractTextMutation.mutateAsync({
				photos: photoInputs,
			});
			setEntryText(result.text);

			// Distinct calendar dates the page itself is dated with — one match means
			// we can default entryDate to what's actually written instead of leaving
			// it at whatever it started as; two or more means these photos likely
			// aren't one day's entry at all, which the crease stage warns about
			// instead of silently merging them under a single date.
			const distinctDates = [
				...new Set(result.mentionedDates.map((d) => d.resolvedDate)),
			];
			if (distinctDates.length === 1) {
				// biome-ignore lint/style/noNonNullAssertion: length check above guarantees exactly one element
				const only = distinctDates[0]!;
				setEntryDate(only);
				setDetectedDate(only);
			} else if (distinctDates.length > 1) {
				setMultiDayDates(distinctDates);
			}

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

	async function runExtractInsights() {
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

	async function handleContinueToInsights() {
		setExtractInsightsError(null);
		setCheckingDuplicate(true);
		try {
			const duplicate = await utils.entry.findPossibleDuplicate.fetch({
				text: entryText,
			});
			setCheckingDuplicate(false);
			if (duplicate) {
				setPossibleDuplicate(duplicate);
				return;
			}
			await runExtractInsights();
		} catch (err) {
			setCheckingDuplicate(false);
			setExtractInsightsError(
				errorMessage(err, "Couldn't check for duplicates. Try again?"),
			);
		}
	}

	function handleContinueAnyway() {
		setPossibleDuplicate(null);
		void runExtractInsights();
	}

	function handleCrisisContinue() {
		setCrisisCheckIn(false);
		setStageIndex(1);
	}

	function discardInsight(id: string) {
		setInsights((prev) => prev.filter((i) => i.id !== id));
		setConfirmingDiscardId(null);
	}

	function resetInsightForm() {
		setAddingInsight(false);
		setEditingInsightId(null);
		setNewCategory("mood");
		setNewLabel("");
		setNewValue("");
	}

	function openAddInsight() {
		setConfirmingDiscardId(null);
		setEditingInsightId(null);
		setAddingInsight(true);
	}

	function openEditInsight(insight: Insight) {
		setConfirmingDiscardId(null);
		setAddingInsight(false);
		setEditingInsightId(insight.id);
		setNewCategory(insight.category);
		setNewLabel(insight.label);
		setNewValue(insight.value);
	}

	function handleAddInsight() {
		if (!newLabel.trim() || !newValue.trim()) return;
		setInsights((prev) => [
			...prev,
			{
				id: crypto.randomUUID(),
				category: newCategory,
				label: newLabel.trim(),
				value: newValue.trim(),
			},
		]);
		resetInsightForm();
	}

	function handleSaveEditedInsight() {
		if (!newLabel.trim() || !newValue.trim() || !editingInsightId) return;
		setInsights((prev) =>
			prev.map((i) =>
				i.id === editingInsightId
					? {
							...i,
							category: newCategory,
							label: newLabel.trim(),
							value: newValue.trim(),
						}
					: i,
			),
		);
		resetInsightForm();
	}

	async function handleSave() {
		setSaveError(null);
		try {
			const result = await saveMutation.mutateAsync({
				text: entryText,
				entryDate,
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
		<>
			{crisisCheckIn && (
				<CrisisCheckInModal onContinue={handleCrisisContinue} />
			)}

			<header className="flex items-baseline justify-between border-indigo-500 border-b pb-6">
				<div>
					<p className="font-mono text-indigo-400 text-xs uppercase tracking-[0.2em]">
						{eyebrow}
					</p>
					<h1 className="mt-1 font-semibold text-2xl text-paper-100 sm:text-3xl">
						{title}
					</h1>
					{headerExtra}
				</div>
				<p className="hidden max-w-xs text-right text-indigo-400 text-sm sm:block">
					{description}
				</p>
			</header>

			<div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_1fr] sm:gap-12">
				{/* Numbered margin rail: compact dot strip on mobile, full margin column from sm up */}
				<ol className="flex items-center justify-center gap-3 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0">
					{STAGES.map((s, i) => {
						const state = stageState(i);
						const isLast = i === STAGES.length - 1;
						return (
							<li className="flex items-center gap-3 sm:items-start" key={s.id}>
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
											state === "pending" ? "text-indigo-400" : "text-paper-100"
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
							<PhotoPicker
								hint="Add every page from this session before you extract."
								label="Add a photo of a page"
								onAdd={addPhotos}
								onRemove={removePhoto}
								photos={photos}
							/>

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

							<div className="flex flex-col gap-1">
								<label
									className="font-mono text-[11px] text-ink-600 uppercase tracking-wide"
									htmlFor={entryDateId}
								>
									Date
								</label>
								<input
									className="w-fit rounded-sm border border-indigo-500/20 bg-paper-200 px-3 py-2 text-[15px] text-ink-900 transition-colors focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
									id={entryDateId}
									max={getLocalDateString()}
									onChange={(e) => {
										setEntryDate(e.target.value);
										setDetectedDate(null);
									}}
									type="date"
									value={entryDate}
								/>
								<p className="text-ink-600 text-xs">
									{detectedDate
										? `We noticed you wrote ${formatEntryDate(detectedDate)} on the page — change it if that’s not right.`
										: "Defaults to today — change it if you’re catching up on an older page."}
								</p>
							</div>

							{multiDayDates && (
								<div className="flex flex-col gap-3 rounded-sm border border-indigo-500/40 bg-paper-200 p-4">
									<p className="text-ink-900 text-sm">
										This looks like it covers more than one day —{" "}
										{multiDayDates.map((d) => formatEntryDate(d)).join(" and ")}
										. If these are separate days, you&rsquo;ll get better
										results using{" "}
										<Link
											className="underline decoration-indigo-500/40 underline-offset-4 hover:text-ink-900"
											href="/capture/batch"
										>
											Add several days at once
										</Link>{" "}
										instead of saving them together.
									</p>
								</div>
							)}

							<textarea
								aria-label="Entry text"
								className="min-h-40 resize-y rounded-sm border border-indigo-500/20 bg-paper-200 p-4 text-[15px] text-ink-900 leading-relaxed transition-colors focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
								onChange={(e) => {
									setEntryText(e.target.value);
									setPossibleDuplicate(null);
								}}
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

							{possibleDuplicate && (
								<div className="flex flex-col gap-3 rounded-sm border border-indigo-500/40 bg-paper-200 p-4">
									<p className="text-ink-900 text-sm">
										This looks similar to your entry from{" "}
										<span className="font-medium">
											{formatEntryDate(possibleDuplicate.entryDate)}
										</span>
										. Already logged that one?
									</p>
									<div className="flex justify-end gap-2">
										<button
											className="rounded-full px-3 py-1.5 font-medium text-ink-600 text-xs transition-colors hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
											onClick={() => setPossibleDuplicate(null)}
											type="button"
										>
											Go back and edit
										</button>
										<button
											className="rounded-full bg-indigo-600 px-3 py-1.5 font-medium text-paper-100 text-xs transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
											onClick={handleContinueAnyway}
											type="button"
										>
											Continue anyway
										</button>
									</div>
								</div>
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
										entryDate.length === 0 ||
										checkingDuplicate ||
										extractInsightsMutation.isPending ||
										possibleDuplicate !== null
									}
									onClick={handleContinueToInsights}
									type="button"
								>
									{(checkingDuplicate || extractInsightsMutation.isPending) && (
										<SpinnerIcon />
									)}
									{checkingDuplicate
										? "Checking…"
										: extractInsightsMutation.isPending
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
										You&rsquo;ll see these again next time you log in, alongside
										anything new they connect to.
									</p>
									{renderSavedAction(savedCount)}
								</div>
							) : (
								<>
									{saveError && (
										<p className="rounded-sm bg-paper-200 p-3 text-ink-600 text-sm">
											{saveError}
										</p>
									)}

									{insights.length === 0 ? (
										<p className="text-ink-600 text-sm italic">
											No insights yet — go back and try again, or add one
											yourself below.
										</p>
									) : (
										<ul className="flex flex-col gap-3">
											{insights.map((insight) => {
												if (confirmingDiscardId === insight.id) {
													return (
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
													);
												}

												if (editingInsightId === insight.id) {
													return (
														<li
															className="flex flex-col gap-3 rounded-sm border border-indigo-500/40 bg-paper-200 p-4"
															key={insight.id}
														>
															<div className="flex flex-col gap-1">
																<label
																	className="font-mono text-[11px] text-ink-600 uppercase tracking-wide"
																	htmlFor={newCategoryId}
																>
																	Category
																</label>
																<select
																	className="rounded-sm border border-indigo-500/20 bg-paper-100 px-3 py-2 text-[15px] text-ink-900 transition-colors focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
																	id={newCategoryId}
																	onChange={(e) =>
																		setNewCategory(e.target.value as Category)
																	}
																	value={newCategory}
																>
																	{CATEGORY_OPTIONS.map((opt) => (
																		<option key={opt.value} value={opt.value}>
																			{opt.label}
																		</option>
																	))}
																</select>
															</div>
															<div className="flex flex-col gap-1">
																<label
																	className="font-mono text-[11px] text-ink-600 uppercase tracking-wide"
																	htmlFor={newLabelId}
																>
																	Label
																</label>
																<input
																	className="rounded-sm border border-indigo-500/20 bg-paper-100 px-3 py-2 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600/60 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
																	id={newLabelId}
																	onChange={(e) => setNewLabel(e.target.value)}
																	type="text"
																	value={newLabel}
																/>
															</div>
															<div className="flex flex-col gap-1">
																<label
																	className="font-mono text-[11px] text-ink-600 uppercase tracking-wide"
																	htmlFor={newValueId}
																>
																	What did you notice?
																</label>
																<input
																	className="rounded-sm border border-indigo-500/20 bg-paper-100 px-3 py-2 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600/60 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
																	id={newValueId}
																	onChange={(e) => setNewValue(e.target.value)}
																	type="text"
																	value={newValue}
																/>
															</div>
															<div className="flex justify-end gap-2">
																<button
																	className="rounded-full px-3 py-1.5 font-medium text-ink-600 text-xs transition-colors hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
																	onClick={resetInsightForm}
																	type="button"
																>
																	Cancel
																</button>
																<button
																	className="rounded-full bg-indigo-600 px-3 py-1.5 font-medium text-paper-100 text-xs transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
																	disabled={
																		newLabel.trim().length === 0 ||
																		newValue.trim().length === 0
																	}
																	onClick={handleSaveEditedInsight}
																	type="button"
																>
																	Save
																</button>
															</div>
														</li>
													);
												}

												return (
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
														<div className="flex shrink-0 gap-2">
															<button
																aria-label={`Edit ${insight.label} insight`}
																className="rounded-sm border border-indigo-500/40 p-2 text-ink-600 transition-colors hover:border-indigo-500 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
																onClick={() => openEditInsight(insight)}
																type="button"
															>
																<EditIcon />
															</button>
															<button
																aria-label={`Discard ${insight.label} insight`}
																className="rounded-sm border border-indigo-500/40 p-2 text-ink-600 transition-colors hover:border-indigo-500 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
																onClick={() => {
																	setConfirmingDiscardId(insight.id);
																	setEditingInsightId(null);
																	setAddingInsight(false);
																}}
																type="button"
															>
																<DiscardIcon />
															</button>
														</div>
													</li>
												);
											})}
										</ul>
									)}

									{addingInsight ? (
										<div className="flex flex-col gap-3 rounded-sm border border-indigo-500/40 bg-paper-200 p-4">
											<div className="flex flex-col gap-1">
												<label
													className="font-mono text-[11px] text-ink-600 uppercase tracking-wide"
													htmlFor={newCategoryId}
												>
													Category
												</label>
												<select
													className="rounded-sm border border-indigo-500/20 bg-paper-100 px-3 py-2 text-[15px] text-ink-900 transition-colors focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
													id={newCategoryId}
													onChange={(e) =>
														setNewCategory(e.target.value as Category)
													}
													value={newCategory}
												>
													{CATEGORY_OPTIONS.map((opt) => (
														<option key={opt.value} value={opt.value}>
															{opt.label}
														</option>
													))}
												</select>
											</div>
											<div className="flex flex-col gap-1">
												<label
													className="font-mono text-[11px] text-ink-600 uppercase tracking-wide"
													htmlFor={newLabelId}
												>
													Label
												</label>
												<input
													className="rounded-sm border border-indigo-500/20 bg-paper-100 px-3 py-2 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600/60 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
													id={newLabelId}
													onChange={(e) => setNewLabel(e.target.value)}
													placeholder="e.g. Mood, or Goal: Marlowe project"
													type="text"
													value={newLabel}
												/>
											</div>
											<div className="flex flex-col gap-1">
												<label
													className="font-mono text-[11px] text-ink-600 uppercase tracking-wide"
													htmlFor={newValueId}
												>
													What did you notice?
												</label>
												<input
													className="rounded-sm border border-indigo-500/20 bg-paper-100 px-3 py-2 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600/60 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
													id={newValueId}
													onChange={(e) => setNewValue(e.target.value)}
													placeholder="One sentence is plenty"
													type="text"
													value={newValue}
												/>
											</div>
											<div className="flex justify-end gap-2">
												<button
													className="rounded-full px-3 py-1.5 font-medium text-ink-600 text-xs transition-colors hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
													onClick={resetInsightForm}
													type="button"
												>
													Cancel
												</button>
												<button
													className="rounded-full bg-indigo-600 px-3 py-1.5 font-medium text-paper-100 text-xs transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
													disabled={
														newLabel.trim().length === 0 ||
														newValue.trim().length === 0
													}
													onClick={handleAddInsight}
													type="button"
												>
													Add
												</button>
											</div>
										</div>
									) : (
										<button
											className="flex items-center justify-center gap-2 rounded-sm border border-indigo-500/40 border-dashed px-4 py-3 text-center text-ink-600 text-sm transition-colors hover:border-indigo-500 hover:bg-paper-200"
											onClick={openAddInsight}
											type="button"
										>
											<AddIcon />
											Add an insight
										</button>
									)}

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
											disabled={saveMutation.isPending || insights.length === 0}
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
		</>
	);
}
