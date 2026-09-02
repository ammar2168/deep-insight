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
								"The exact words from the page stating the date, copied verbatim (e.g. 'August 26th', 'Sept 3').",
						},
						resolved_date: {
							type: "string" as const,
							description:
								"That date resolved to YYYY-MM-DD. Use today's date only to fill in a missing year or resolve a relative reference — never change what the page actually says.",
						},
					},
					required: ["raw_text", "resolved_date"],
				},
				description:
					"Every date the writer uses to mark WHEN this entry (or a distinct section of it) was written — typically a header at the top of a page or paragraph, like a diary dateline. Do NOT include a date mentioned only in passing (an appointment, someone's birthday, a plan for next week) — only dates that mark the entry itself. If the page has no such dateline at all, return an empty array rather than guessing.",
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

	const toolUse = response.content.find((block) => block.type === "tool_use");
	if (toolUse?.type !== "tool_use") {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Couldn't read a response from the model",
		});
	}

	const input = toolUse.input as {
		transcription?: string;
		mentioned_dates?: { raw_text?: string; resolved_date?: string }[];
	};
	const text = (input.transcription ?? "").trim();

	// Mechanically verified rather than trusted: a date the model claims to have
	// read must actually be findable in the transcription it just produced, or
	// it's dropped — same anti-fabrication rule as everywhere else this touches
	// AI output that goes on to make a decision (here, what to default entryDate to).
	const mentionedDates = (input.mentioned_dates ?? [])
		.filter(
			(d): d is { raw_text: string; resolved_date: string } =>
				typeof d.raw_text === "string" && typeof d.resolved_date === "string",
		)
		.filter((d) => text.toLowerCase().includes(d.raw_text.toLowerCase()))
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
		max_tokens: 1024,
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

	const toolUse = response.content.find((block) => block.type === "tool_use");
	if (toolUse?.type !== "tool_use") {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Couldn't read a structured response from the model",
		});
	}

	const input = toolUse.input as { insights?: ExtractedInsight[] };
	return input.insights ?? [];
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

Be warm, concise, and specific — reference their own insights directly rather than speaking in generalities. If you don't have enough to answer well even after using a tool if needed, say so honestly instead of guessing or inventing detail.

Format for readability, using markdown:
- Open with one short sentence, not a summary paragraph.
- When answering with more than one distinct item (goals, patterns, entries), use a markdown list — one item per line, a short **bold** label for each, then a brief description. Never fold multiple distinct items into one paragraph.
- Keep each list item to one line where possible; split into a couple of sentences only when a single item genuinely needs it.
- When there's only one thing to say, a short paragraph is fine — don't force a list.
- Close with a brief, natural offer to go deeper on one of the things you mentioned (e.g. "Want to think through next steps on any of these?"), when it fits the question. Skip it if it would feel forced.

Insights on record:
${insightContext}`,
		messages: [...historyMessages, { role: "user", content: question }],
		tools: [buildAnalyzeTrendTool(userId)],
		maxTokens: 1024,
	});
}
