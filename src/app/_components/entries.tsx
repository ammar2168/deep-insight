"use client";

import { useState } from "react";

import { api } from "@/trpc/react";

export function Entries() {
	const [entries] = api.entry.list.useSuspenseQuery();

	const utils = api.useUtils();
	const [text, setText] = useState("");

	const createEntry = api.entry.create.useMutation({
		onSuccess: async () => {
			await utils.entry.invalidate();
			setText("");
		},
	});

	const deleteEntry = api.entry.delete.useMutation({
		onSuccess: async () => {
			await utils.entry.invalidate();
		},
	});

	return (
		<div className="w-full max-w-xs">
			<form
				className="flex flex-col gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					createEntry.mutate({ text });
				}}
			>
				<input
					className="w-full rounded-full bg-white/10 px-4 py-2 text-white"
					onChange={(e) => setText(e.target.value)}
					placeholder="What's on your mind?"
					type="text"
					value={text}
				/>
				<button
					className="rounded-full bg-white/10 px-10 py-3 font-semibold transition hover:bg-white/20"
					disabled={createEntry.isPending}
					type="submit"
				>
					{createEntry.isPending ? "Submitting..." : "Add entry"}
				</button>
			</form>

			<ul className="mt-4 flex flex-col gap-2">
				{entries.length === 0 && <p>You have no entries yet.</p>}
				{entries.map((entry) => (
					<li
						className="flex items-center justify-between gap-2 rounded-full bg-white/10 px-4 py-2"
						key={entry.id}
					>
						<span className="truncate">{entry.text}</span>
						<button
							className="text-white/60 hover:text-white"
							disabled={deleteEntry.isPending}
							onClick={() => deleteEntry.mutate({ id: entry.id })}
							type="button"
						>
							✕
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}
