import "server-only";

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

import { decryptManyForUser } from "@/server/crypto/envelope";
import { db } from "@/server/db";
import { entries } from "@/server/db/schema";

const MAX_TIMELINE_RANGE_DAYS = 400;
// A shared budget for one analyzeTrend call, not per-candidate — callers with several
// candidates are expected to merge and dedupe every candidate's padded dates into one
// call rather than calling this once per candidate. Still trivially cheap at this size.
const MAX_RAW_TEXT_DATES = 50;

export type TimelineEntry = {
	entryId: number;
	insightId: number;
	entryDate: string;
	category: string;
	label: string;
	value: string;
};

/**
 * The Tier 1 index: every insight in range, decrypted, as compact structured rows —
 * across ALL categories, never filtered to just the category the question names. The
 * real explanation for a shift is often in a category with no obvious topical link
 * (e.g. a health entry explaining a sleep pattern), so narrowing by category before an
 * LLM ever sees the data would rule out exactly the connections this exists to find.
 *
 * Carries entryId/insightId on every row (not just the date) specifically so a later
 * answer can be traced back to the exact database rows that produced it — see
 * analyzeTrend's traceId logging, which logs these ids at every stage.
 */
export async function buildInsightTimeline(
	userId: string,
	startDate: string,
	endDate: string,
): Promise<TimelineEntry[]> {
	const rangeDays =
		(new Date(endDate).getTime() - new Date(startDate).getTime()) /
		(1000 * 60 * 60 * 24);
	if (rangeDays > MAX_TIMELINE_RANGE_DAYS) {
		throw new Error(
			`Date range too wide (${Math.round(rangeDays)} days) — max is ${MAX_TIMELINE_RANGE_DAYS}.`,
		);
	}

	const rows = await db.query.entries.findMany({
		where: and(
			eq(entries.userId, userId),
			gte(entries.entryDate, startDate),
			lte(entries.entryDate, endDate),
		),
		orderBy: asc(entries.entryDate),
		with: { insights: true },
	});

	const flat = rows.flatMap((entry) =>
		entry.insights.map((insight) => ({ entry, insight })),
	);
	const decryptedValues = await decryptManyForUser(
		userId,
		flat.map(({ insight }) => insight.value),
	);

	return flat.map(({ entry, insight }, i) => ({
		entryId: entry.id,
		insightId: insight.id,
		entryDate: entry.entryDate,
		category: insight.category,
		label: insight.label,
		// biome-ignore lint/style/noNonNullAssertion: decryptedValues has exactly one entry per flat item, same order
		value: decryptedValues[i]!,
	}));
}

/**
 * Raw entry text (decrypted) for a specific, small set of dates — used only for the
 * narrow Tier 2 confirm step, on whatever handful of windows Tier 1 flagged. Never
 * called with a broad range; that's what buildInsightTimeline is for. Call this once
 * with every date needed across all candidates merged together — it dedupes
 * internally, but only within a single call, not across separate calls.
 */
export async function getRawEntryText(
	userId: string,
	dates: string[],
): Promise<{ entryId: number; entryDate: string; text: string }[]> {
	const uniqueDates = [...new Set(dates)].slice(0, MAX_RAW_TEXT_DATES);
	if (uniqueDates.length === 0) return [];

	const rows = await db.query.entries.findMany({
		where: and(
			eq(entries.userId, userId),
			inArray(entries.entryDate, uniqueDates),
		),
		orderBy: asc(entries.entryDate),
	});

	const decryptedTexts = await decryptManyForUser(
		userId,
		rows.map((row) => row.text),
	);

	return rows.map((row, i) => ({
		entryId: row.id,
		entryDate: row.entryDate,
		// biome-ignore lint/style/noNonNullAssertion: decryptedTexts has exactly one entry per row, same order
		text: decryptedTexts[i]!,
	}));
}
