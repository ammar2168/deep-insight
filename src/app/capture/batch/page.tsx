"use client";

import Link from "next/link";
import { useState } from "react";

import {
	createPhotosFromFiles,
	DayCapture,
	formatEntryDate,
	getLocalDateString,
	type Photo,
	PhotoPicker,
} from "@/app/_components/day-capture";

type DayGroup = { id: string; date: string; photos: Photo[] };

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

function newGroup(): DayGroup {
	return { id: crypto.randomUUID(), date: getLocalDateString(), photos: [] };
}

export default function BatchCapturePage() {
	const [groups, setGroups] = useState<DayGroup[]>(() => [newGroup()]);
	const [started, setStarted] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);

	function addGroup() {
		setGroups((prev) => [...prev, newGroup()]);
	}

	function removeGroup(id: string) {
		setGroups((prev) => prev.filter((g) => g.id !== id));
	}

	function setGroupDate(id: string, date: string) {
		setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, date } : g)));
	}

	function addPhotosToGroup(id: string, files: FileList | null) {
		if (!files) return;
		const next = createPhotosFromFiles(files);
		setGroups((prev) =>
			prev.map((g) =>
				g.id === id ? { ...g, photos: [...g.photos, ...next] } : g,
			),
		);
	}

	function removePhotoFromGroup(groupId: string, photoId: string) {
		setGroups((prev) =>
			prev.map((g) =>
				g.id === groupId
					? { ...g, photos: g.photos.filter((p) => p.id !== photoId) }
					: g,
			),
		);
	}

	const canStart =
		groups.length > 0 &&
		groups.every((g) => g.photos.length > 0 && g.date.length > 0);

	if (started) {
		// biome-ignore lint/style/noNonNullAssertion: activeIndex is always clamped to a valid groups index
		const activeGroup = groups[activeIndex]!;
		const isLastDay = activeIndex === groups.length - 1;

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
						description="Catching up on several days — each one folds into its own entry."
						eyebrow={`Day ${activeIndex + 1} of ${groups.length}`}
						initialDate={activeGroup.date}
						initialPhotos={activeGroup.photos}
						key={activeGroup.id}
						renderSavedAction={() =>
							isLastDay ? (
								<Link
									className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
									href="/"
								>
									Back to your insights
								</Link>
							) : (
								<button
									className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
									onClick={() => setActiveIndex((i) => i + 1)}
									type="button"
								>
									Next day
								</button>
							)
						}
						title={formatEntryDate(activeGroup.date)}
					/>
				</div>
			</main>
		);
	}

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
					className="inline-flex w-fit items-center gap-1.5 text-indigo-400 text-sm underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
					href="/"
				>
					<BackIcon />
					Home
				</Link>

				<header className="flex flex-col gap-2 border-indigo-500 border-b pb-6">
					<p className="font-mono text-indigo-400 text-xs uppercase tracking-[0.2em]">
						Catching up
					</p>
					<h1 className="mt-1 font-semibold text-2xl text-paper-100 sm:text-3xl">
						Add several days at once
					</h1>
					<p className="text-indigo-400 text-sm">
						Group your photos by day below, then go through them one at a time.{" "}
						<Link
							className="underline decoration-indigo-500/40 underline-offset-4 hover:text-paper-100"
							href="/capture"
						>
							Just one day?
						</Link>
					</p>
				</header>

				<div className="flex flex-col gap-5">
					{groups.map((group, i) => {
						const dateInputId = `day-${i}-date`;
						return (
							<div
								className="rounded-sm bg-paper-100 p-6 text-ink-900 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8"
								key={group.id}
							>
								<div className="flex items-center justify-between">
									<h2 className="font-semibold text-ink-900 text-lg">
										Day {i + 1}
									</h2>
									{groups.length > 1 && (
										<button
											className="text-ink-600 text-xs underline decoration-indigo-500/40 underline-offset-4 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
											onClick={() => removeGroup(group.id)}
											type="button"
										>
											Remove this day
										</button>
									)}
								</div>

								<div className="mt-4 flex flex-col gap-1">
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
										onChange={(e) => setGroupDate(group.id, e.target.value)}
										type="date"
										value={group.date}
									/>
								</div>

								<div className="mt-4">
									<PhotoPicker
										hint="Add every page for this day."
										label="Add a photo of a page"
										onAdd={(files) => addPhotosToGroup(group.id, files)}
										onRemove={(photoId) =>
											removePhotoFromGroup(group.id, photoId)
										}
										photos={group.photos}
									/>
								</div>
							</div>
						);
					})}

					<button
						className="flex items-center justify-center gap-2 rounded-sm border border-indigo-400/40 border-dashed px-4 py-3 text-center text-indigo-300 text-sm transition-colors hover:border-indigo-300 hover:text-paper-100"
						onClick={addGroup}
						type="button"
					>
						+ Add another day
					</button>
				</div>

				<div className="flex justify-end">
					<button
						className="inline-flex items-center gap-2 rounded-sm bg-indigo-600 px-5 py-2.5 font-medium text-paper-100 text-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!canStart}
						onClick={() => setStarted(true)}
						type="button"
					>
						Start with Day 1
					</button>
				</div>
			</div>
		</main>
	);
}
