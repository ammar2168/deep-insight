import "server-only";

import { randomUUID } from "node:crypto";

import {
	confirmCandidate,
	flagCorrelationCandidates,
	synthesizeTrendAnswer,
} from "@/server/ai/trends";
import {
	buildInsightTimeline,
	getRawEntryText,
} from "@/server/insights/timeline";

function addDays(dateStr: string, days: number): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

const CONFIRM_WINDOW_PADDING_DAYS = 2;

function paddedDatesFor(excerpts: { date: string }[]): string[] {
	return excerpts.flatMap(({ date }) => [
		addDays(date, -CONFIRM_WINDOW_PADDING_DAYS),
		date,
		addDays(date, CONFIRM_WINDOW_PADDING_DAYS),
	]);
}

/**
 * Tier 1 + Tier 2, end to end: build the index for the range, ask an LLM to flag
 * cross-category candidate explanations, confirm each one against the actual raw
 * text for just its flagged window (never the full range), then synthesize a single
 * hedged answer. On-demand only — no caching or scheduling here, see BACKLOG.md.
 *
 * Every call gets a short traceId, logged at every stage alongside the actual
 * entry/insight ids involved — so if an answer is ever flagged as wrong, the exact
 * chain (Tier 1 index -> Tier 2 candidates -> confirmed evidence -> entries/insights
 * behind it) can be reconstructed from logs alone, without re-running anything.
 * Not yet attached to a stored chat message, since chat has no persistence to attach
 * it to (see BACKLOG.md) — that's the natural next step once it does, not something
 * to half-build here ahead of a real consumer.
 */
export async function analyzeTrend(
	userId: string,
	question: string,
	range: { start: string; end: string },
): Promise<string> {
	const traceId = randomUUID().slice(0, 8);
	const log = (msg: string) =>
		console.log(`[trend-analysis:${traceId}] ${msg}`);

	const timeline = await buildInsightTimeline(userId, range.start, range.end);
	if (timeline.length === 0) {
		log(`no data in range ${range.start} to ${range.end}`);
		return "There's nothing recorded for that period yet, so I don't have anything to look at.";
	}
	const entryIds = [...new Set(timeline.map((t) => t.entryId))];
	log(
		`${timeline.length} insight(s) across ${entryIds.length} entries (ids: ${entryIds.join(",")}), range ${range.start} to ${range.end}`,
	);

	const flagResult = await flagCorrelationCandidates(
		question,
		timeline,
		traceId,
	);
	const trendSummary = flagResult.trend_summary;
	const candidates = flagResult.candidates ?? [];
	log(
		`flagged ${candidates.length} candidate(s) — confidence: [${candidates.map((c) => c.confidence).join(", ")}]`,
	);

	if (candidates.length === 0) {
		return synthesizeTrendAnswer(question, trendSummary, [], traceId);
	}

	// One shared, deduplicated raw-text fetch across every candidate's padded window,
	// instead of each candidate independently re-fetching (and re-decrypting) any day
	// its window happens to share with another candidate's — a real cost with several
	// overlapping candidates, which is the common case, not the exception.
	const paddedDatesByCandidate = candidates.map((c) =>
		paddedDatesFor(c.supporting_excerpts),
	);
	const rawTextRows = await getRawEntryText(
		userId,
		paddedDatesByCandidate.flat(),
	);
	log(
		`pulled raw text for ${rawTextRows.length} day(s), entry ids: ${rawTextRows.map((r) => r.entryId).join(",")}`,
	);
	const rawTextByDate = new Map(rawTextRows.map((r) => [r.entryDate, r]));

	const confirmed = await Promise.all(
		candidates.map((candidate, i) => {
			const rawText = (paddedDatesByCandidate[i] ?? [])
				.map((date) => rawTextByDate.get(date))
				.filter((row) => row !== undefined);
			return confirmCandidate(candidate, rawText, traceId);
		}),
	);
	const plausibleCount = confirmed.filter((c) => c.still_plausible).length;
	log(`confirmed: ${plausibleCount}/${confirmed.length} still plausible`);

	return synthesizeTrendAnswer(question, trendSummary, confirmed, traceId);
}
