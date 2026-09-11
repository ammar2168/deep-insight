import "server-only";

import { TRPCError } from "@trpc/server";

import { INSIGHT_CATEGORIES } from "@/server/db/schema/insight";
import { analyzeTrend } from "@/server/insights/trend-analysis";
import { getClient, MODEL } from "./client";
import { runToolLoop, type ToolDefinition } from "./tool-loop";

export type Photo = { base64: string; mediaType: string };

const SUPPORTED_MEDIA_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
] as const;
type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

function asSupportedMediaType(mediaType: string): SupportedMediaType {
	const match = SUPPORTED_MEDIA_TYPES.find((m) => m === mediaType);
	if (!match) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Unsupported image type: ${mediaType}`,
		});
	}
	return match;
}

/** Strip an optional "data:image/jpeg;base64," prefix, if the client sent a full data URL. */
function stripDataUrlPrefix(base64: string) {
	const commaIndex = base64.indexOf(",");
	return base64.startsWith("data:") && commaIndex !== -1
		? base64.slice(commaIndex + 1)
		: base64;
}

const RECORD_TRANSCRIPTION_TOOL = {
	name: "record_transcription",
	description: "Record the verbatim transcription of the handwritten page(s).",
	input_schema: {
		type: "object" as const,
		properties: {
			transcription: {
				type: "string" as const,
				description:
					"The transcribed handwriting, exactly as written, nothing else. No commentary, caveats, safety notes, or reactions of any kind, even if the content is emotionally difficult, distressing, or concerning — this field holds only what the writer wrote, verbatim.",
			},
			mentioned_dates: {
				type: "array" as const,
				items: {
					type: "object" as const,
					properties: {
						raw_text: {
							type: "string" as const,
							description:
								"The exact words from the page stating the date, copied verbatim. Must itself contain a day-of-month number and/or a month (e.g. 'August 26th', 'Sept 3', '9/3'). Never a holiday name, season, or relative term with no number in it (e.g. 'Labor Day', 'Christmas', 'my birthday', 'last weekend') — those aren't dates on the page, they're words that would require you to go calculate one, which is exactly what this field must not do.",
						},
						resolved_date: {
							type: "string" as const,
							description:
								"The raw_text date resolved to YYYY-MM-DD. Use today's date ONLY to fill in a year the page left out (e.g. 'August 26th' with no year becomes the most recent August 26th). Never compute a date from a holiday name, season, or relative day term — if raw_text isn't already an explicit day-of-month, this field doesn't apply and the entry should be left out of this list entirely.",
						},
					},
					required: ["raw_text", "resolved_date"],
				},
				description:
					"Every EXPLICIT date (a day-of-month, written as a number) the writer uses to mark WHEN this entry (or a distinct section of it) was written — typically a header at the top of a page or paragraph, like a diary dateline. Do NOT include a date mentioned only in passing (an appointment, someone's birthday, a plan for next week), and do NOT include holiday names, seasons, or relative terms ('Labor Day', 'the holidays', 'last Tuesday') even if they're clearly the entry's own dateline — only an actual day-of-month number counts. If the page has no such explicit dateline at all, return an empty array rather than computing or guessing one.",
			},
		},
		required: ["transcription", "mentioned_dates"],
	},
};

export async function extractTextFromPhotos(photos: Photo[]): Promise<{
	text: string;
	mentionedDates: { rawText: string; resolvedDate: string }[];
}> {
	if (photos.length === 0) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "No photos provided" });
	}

	const client = getClient();
	const today = new Date().toISOString().slice(0, 10);

	const response = await client.messages.create({
		model: MODEL,
		max_tokens: 4096,
		tools: [RECORD_TRANSCRIPTION_TOOL],
		tool_choice: { type: "tool", name: "record_transcription" },
		messages: [
			{
				role: "user",
				content: [
					...photos.map(
						(photo) =>
							({
								type: "image",
								source: {
									type: "base64",
									media_type: asSupportedMediaType(photo.mediaType),
									data: stripDataUrlPrefix(photo.base64),
								},
							}) as const,
					),
					{
						type: "text",
						text: `These are photo(s) of one handwritten journal page, or several pages from the same journalling session. Transcribe the handwritten text as accurately as you can into clean, continuous prose. Today's date is ${today}.

- Preserve paragraph breaks the writer used.
- If a word is illegible, use your best guess rather than skipping it.
- If multiple photos are provided, transcribe them in order as one continuous entry.
- The transcription field holds ONLY what's written on the page — never add your own commentary, headers, dates, safety notes, or reactions, no matter what the content is. A separate part of this system, not you, handles anything that needs a caring response.
- Separately, record any dateline the writer used to mark when an entry was written (see the mentioned_dates field) — this is metadata for the app, not part of the transcription itself.`,
					},
				],
			},
		],
	});

	console.log(
		`[extractText] stop_reason=${response.stop_reason} output_tokens=${response.usage.output_tokens}`,
	);
	if (response.stop_reason === "max_tokens") {
		console.warn(
			"[extractText] response hit max_tokens — output was likely truncated",
		);
	}

	const toolUse = response.content.find((block) => block.type === "tool_use");
	if (toolUse?.type !== "tool_use") {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Couldn't read a response from the model",
		});
	}

	const input = toolUse.input as {
		transcription?: string;
		mentioned_dates?: unknown;
	};
	const text = (input.transcription ?? "").trim();
	const rawMentionedDates = Array.isArray(input.mentioned_dates)
		? (input.mentioned_dates as { raw_text?: string; resolved_date?: string }[])
		: [];

	// Mechanically verified rather than trusted: a date the model claims to have
	// read must actually be findable in the transcription it just produced, or
	// it's dropped — same anti-fabrication rule as everywhere else this touches
	// AI output that goes on to make a decision (here, what to default entryDate to).
	// resolved_date is also checked against the exact YYYY-MM-DD shape the client
	// feeds straight into a controlled <input type="date">: a browser silently
	// blanks that input for any other shape while React's own state keeps holding
	// the original string, so a malformed value here would sail through the UI
	// looking like nothing's wrong and only fail once save's own zod check hits it.
	const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
	/** Right shape isn't enough — "2026-13-45" matches ISO_DATE too. Round-tripping
	 * through Date confirms it's a real calendar day, not just digits in the right places. */
	function isRealCalendarDate(value: string): boolean {
		const [year, month, day] = value.split("-").map(Number);
		const d = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
		return (
			d.getUTCFullYear() === year &&
			d.getUTCMonth() === (month ?? 0) - 1 &&
			d.getUTCDate() === day
		);
	}
	const mentionedDates = rawMentionedDates
		.filter(
			(d): d is { raw_text: string; resolved_date: string } =>
				typeof d.raw_text === "string" && typeof d.resolved_date === "string",
		)
		.filter((d) => text.toLowerCase().includes(d.raw_text.toLowerCase()))
		// Prompt wording alone isn't enough to stop this: real-world testing caught the
		// model treating "Labor Day weekend" (a holiday name, no date on the page at
		// all) as a dateline and computing an actual calendar date for it — raw_text
		// was still a genuine substring of the transcription, so the check above let it
		// through. A real dateline always has a day-of-month digit somewhere in it; a
		// holiday/season/relative name never does, so this catches the whole class
		// mechanically instead of hoping every future phrasing gets prompted away.
		.filter((d) => /\d/.test(d.raw_text))
		.filter(
			(d) =>
				ISO_DATE.test(d.resolved_date) && isRealCalendarDate(d.resolved_date),
		)
		.map((d) => ({ rawText: d.raw_text, resolvedDate: d.resolved_date }));

	return { text, mentionedDates };
}

export type ExtractedInsight = {
	category: (typeof INSIGHT_CATEGORIES)[number];
	label: string;
	value: string;
};

const RECORD_INSIGHTS_TOOL = {
	name: "record_insights",
	description: "Record the discrete insights extracted from a journal entry.",
	input_schema: {
		type: "object" as const,
		properties: {
			insights: {
				type: "array" as const,
				items: {
					type: "object" as const,
					properties: {
						category: {
							type: "string" as const,
							enum: INSIGHT_CATEGORIES,
							description: "Which broad bucket this insight belongs to.",
						},
						label: {
							type: "string" as const,
							description:
								"Short label for what this insight is about, 1-4 words (e.g. 'Mood', 'Sleep', 'Goal: Marlowe project'). Can be specific/dynamic (e.g. name a goal or project), unlike category.",
						},
						value: {
							type: "string" as const,
							description:
								'One concise sentence summarizing what the entry says about this, grounded only in the text. Address the writer directly as "you" (e.g. "You got about four hours of sleep"), never third person ("the writer").',
						},
					},
					required: ["category", "label", "value"],
				},
			},
		},
		required: ["insights"],
	},
};

export async function extractInsightsFromText(
	text: string,
): Promise<ExtractedInsight[]> {
	const client = getClient();

	const response = await client.messages.create({
		model: MODEL,
		max_tokens: 2048,
		tools: [RECORD_INSIGHTS_TOOL],
		tool_choice: { type: "tool", name: "record_insights" },
		messages: [
			{
				role: "user",
				content: `You are extracting concise personal insights from a journal entry, for an app that surfaces them back to the writer.

Read the entry below and extract 3-6 short, discrete insights about the writer's mood, sleep, habits, relationships, or goals/projects they mention — only things actually supported by the text. Each insight needs a category (${INSIGHT_CATEGORIES.join(", ")}), a short label, and a one-sentence value written in second person, speaking directly to the writer as "you" — this reads back to them personally, not as a clinical report about "the writer". Use "goal" for anything tied to a specific named project or objective, and give it a label that names it (e.g. "Goal: Marlowe project"), not just "Goal". Use "other" only when nothing else fits. Do not invent anything the text doesn't support. If the entry is too short or vague to say anything meaningful, return an empty list rather than making something up.

Journal entry:
"""
${text}
"""`,
			},
		],
	});

	console.log(
		`[extractInsights] stop_reason=${response.stop_reason} output_tokens=${response.usage.output_tokens}`,
	);
	if (response.stop_reason === "max_tokens") {
		console.warn(
			"[extractInsights] response hit max_tokens — output was likely truncated",
		);
	}

	const toolUse = response.content.find((block) => block.type === "tool_use");
	if (toolUse?.type !== "tool_use") {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Couldn't read a structured response from the model",
		});
	}

	const input = toolUse.input as { insights?: unknown };
	const insights = normalizeInsightsShape(input.insights);
	if (!insights) {
		// A long real entry can also push a truncated tool call's JSON into a
		// shape that isn't a clean array, and casting alone won't catch that at
		// runtime — surface it plainly instead of crashing downstream with an
		// opaque "X.map is not a function" wherever the caller expects a list.
		// Logs shape only, never the model's actual output — that output is
		// derived from the user's own journal text.
		console.error(
			`[extractInsights] malformed tool response, stop_reason=${response.stop_reason}, ` +
				`typeof insights=${typeof input.insights}, keys=${Object.keys(toolUse.input as object).join(",")}`,
		);
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Couldn't read insights from the model's response",
		});
	}
	return insights;
}

/**
 * Validates (and where possible, recovers) the raw `insights` field from the
 * model's tool-use response. Exported standalone so the exact shape this
 * bug hit — a JSON-encoded string instead of a real array, inside an
 * otherwise well-formed tool call — is directly unit-testable without
 * mocking the Claude API itself. Returns null on anything not confidently a
 * real list of insights; never guesses at partial or malformed data.
 */
export function normalizeInsightsShape(
	raw: unknown,
): ExtractedInsight[] | null {
	let insights = raw;

	// Observed, not hypothetical: the model occasionally serializes the array
	// as a JSON-encoded string within an otherwise well-formed tool call
	// (stop_reason is a clean "tool_use", not a truncation) — recover that
	// specific, common shape rather than failing a batch over it, but still
	// fully validate the result below before trusting it either way.
	if (typeof insights === "string") {
		try {
			insights = JSON.parse(insights);
		} catch {
			// Falls through to the shape check, which rejects it either way.
		}
	}

	if (!Array.isArray(insights) || !insights.every(isWellFormedInsight)) {
		return null;
	}
	return insights;
}

function isWellFormedInsight(item: unknown): item is ExtractedInsight {
	if (typeof item !== "object" || item === null) return false;
	const { category, label, value } = item as Record<string, unknown>;
	return (
		typeof category === "string" &&
		(INSIGHT_CATEGORIES as readonly string[]).includes(category) &&
		typeof label === "string" &&
		typeof value === "string"
	);
}

const ANALYZE_TREND_TOOL_DESCRIPTION =
	"Investigate a pattern, change, or possible correlation in the user's journal history over a date range — not for simple lookups, only for questions about how something has changed or what might explain a shift over a meaningful span of time (weeks or months). Looks across ALL categories, not just the one the question names, and returns a hedged, evidence-grounded answer — never a certain one.";

function buildAnalyzeTrendTool(userId: string): ToolDefinition {
	return {
		name: "analyze_trend",
		description: ANALYZE_TREND_TOOL_DESCRIPTION,
		input_schema: {
			type: "object",
			properties: {
				question: {
					type: "string",
					description: "The specific trend or pattern question to investigate.",
				},
				start_date: { type: "string", description: "YYYY-MM-DD, inclusive." },
				end_date: { type: "string", description: "YYYY-MM-DD, inclusive." },
			},
			required: ["question", "start_date", "end_date"],
		},
		handler: async (input: {
			question: string;
			start_date: string;
			end_date: string;
		}) => {
			try {
				return await analyzeTrend(userId, input.question, {
					start: input.start_date,
					end: input.end_date,
				});
			} catch (err) {
				// A failure here (a transient API error, a DB hiccup mid-pipeline) shouldn't
				// take down the whole chat response — the outer loop is still running and
				// can fall back to the flat recent-insight context already in its system
				// prompt. Never log the question/journal content itself, only metadata.
				console.error(
					`[analyze_trend] failed for range ${input.start_date} to ${input.end_date}:`,
					err instanceof Error ? err.message : err,
				);
				return "A deeper look at this wasn't available right now (a technical issue came up partway through) — answer using only the recent insights already listed, and let the user know a full trend analysis wasn't possible this time so they can try again.";
			}
		},
	};
}

export async function answerQuestion(
	userId: string,
	question: string,
	insights: { label: string; value: string; createdAt: Date }[],
	history: { question: string; answer: string }[],
): Promise<string> {
	const insightContext =
		insights.length === 0
			? "(No insights recorded yet.)"
			: insights
					.map(
						(i) =>
							`- [${i.createdAt.toISOString().slice(0, 10)}] ${i.label}: ${i.value}`,
					)
					.join("\n");

	const historyMessages = history.flatMap(
		(turn) =>
			[
				{ role: "user" as const, content: turn.question },
				{ role: "assistant" as const, content: turn.answer },
			] as const,
	);

	const today = new Date().toISOString().slice(0, 10);

	return runToolLoop({
		system: `You are a reflective journalling assistant inside a personal journal app. Today's date is ${today}.

Answer the user's question using the insights listed below, which were extracted from their own journal entries — this list only covers their most recent insights across all categories, not their full history. If the question is a simple lookup ("what's my latest X", "what did I say about Y recently"), answer directly from this list. If the question asks about a pattern, trend, or change over a meaningful span of time — "how has my sleep been the last few months", "has my mood improved since I started X" — the list below almost certainly isn't enough; use the analyze_trend tool instead of guessing from a handful of recent items.

For open-ended check-in questions with no specific timeframe or focus ("how am I doing", "am I okay", "what's going on with me") — answer from the list above and invite them to name a timeframe or focus if they want a deeper look, rather than reaching for the tool on a genuinely vague question. Reserve the tool for when the question itself signals interest in something over time ("lately", "the last few months", "since I started X") — and even then, if they haven't given an exact range, a moderate default (a few months back) is more proportionate than scanning their entire history for a question that never asked for that.

Not every question will be about their journal at all. A small, self-contained general question — a book title, a quick fact, a definition — is fine to just answer plainly and briefly, clearly as general knowledge and not blended in with anything from their own entries. Don't preface it with a disclaimer about being outside scope and then answer anyway — that just contradicts itself. But if it's broad, open-ended, or the kind of thing that calls for real personal guidance — health, diet, relationships, career, mental health, anything a person should really get from a professional or someone who knows their full situation — say plainly that's outside what you can help with here, and point back to what you can do: reflect on their own journal. The distinction is size and stakes, not topic — a book recommendation is a small, contained fact; "how do I fix my anxiety" is advice you're not positioned to give, even though both could come up under the same subject.

Be warm, concise, and specific — reference their own insights directly rather than speaking in generalities. If you don't have enough to answer well even after using a tool if needed, say so honestly instead of guessing or inventing detail.

Format for readability, using markdown:
- Open with one short sentence, not a summary paragraph.
- When answering with more than one distinct item (goals, patterns, entries), use a markdown list — one item per line, a short **bold** label for each, then a brief description. Never fold multiple distinct items into one paragraph.
- Keep each list item to one line where possible; split into a couple of sentences only when a single item genuinely needs it.
- When there's only one thing to say, a short paragraph is fine — don't force a list.
- Close with a brief, natural offer to go deeper on one of the things you mentioned, when it fits the question — skip it if it would feel forced. When you do include it, it must be its own final paragraph, and that paragraph must be *only* the question — one short sentence, nothing else, ending in "?" (e.g. "Want to think through next steps on any of these?"). Never a statement, never an aside like "let me know if...", and never bundled with other context in the same paragraph — if there's a caveat worth mentioning (e.g. limited data), say that first as its own sentence earlier in the answer, then close with the bare question by itself. That exact shape is what turns it into a clickable next step in the UI, not just decoration.

Insights on record:
${insightContext}`,
		messages: [...historyMessages, { role: "user", content: question }],
		tools: [buildAnalyzeTrendTool(userId)],
		maxTokens: 1024,
	});
}
