import "server-only";

import { TRPCError } from "@trpc/server";

import { INSIGHT_CATEGORIES } from "@/server/db/schema/insight";
import { getClient, MODEL } from "./client";

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
		},
		required: ["transcription"],
	},
};

export async function extractTextFromPhotos(photos: Photo[]): Promise<string> {
	if (photos.length === 0) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "No photos provided" });
	}

	const client = getClient();

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
						text: `These are photo(s) of one handwritten journal page, or several pages from the same journalling session. Transcribe the handwritten text as accurately as you can into clean, continuous prose.

- Preserve paragraph breaks the writer used.
- If a word is illegible, use your best guess rather than skipping it.
- If multiple photos are provided, transcribe them in order as one continuous entry.
- The transcription field holds ONLY what's written on the page — never add your own commentary, headers, dates, safety notes, or reactions, no matter what the content is. A separate part of this system, not you, handles anything that needs a caring response.`,
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

	const input = toolUse.input as { transcription?: string };
	return (input.transcription ?? "").trim();
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

export async function answerQuestion(
	question: string,
	insights: { label: string; value: string; createdAt: Date }[],
	history: { question: string; answer: string }[],
): Promise<string> {
	const client = getClient();

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

	const response = await client.messages.create({
		model: MODEL,
		max_tokens: 1024,
		system: `You are a reflective journalling assistant inside a personal journal app. Answer the user's question using ONLY the insights listed below, which were extracted from their own journal entries. Be warm, concise, and specific — reference their own insights directly rather than speaking in generalities. If the insights don't contain enough to answer well, say so honestly instead of guessing or inventing detail.

Format for readability, using markdown:
- Open with one short sentence, not a summary paragraph.
- When answering with more than one distinct item (goals, patterns, entries), use a markdown list — one item per line, a short **bold** label for each, then a brief description. Never fold multiple distinct items into one paragraph.
- Keep each list item to one line where possible; split into a couple of sentences only when a single item genuinely needs it.
- When there's only one thing to say, a short paragraph is fine — don't force a list.
- Close with a brief, natural offer to go deeper on one of the things you mentioned (e.g. "Want to think through next steps on any of these?"), when it fits the question. Skip it if it would feel forced.

Insights on record:
${insightContext}`,
		messages: [...historyMessages, { role: "user", content: question }],
	});

	const textBlock = response.content.find((block) => block.type === "text");
	if (textBlock?.type !== "text") {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Couldn't read a response from the model",
		});
	}
	return textBlock.text.trim();
}
