import "server-only";

import { getClient, MODEL } from "./client";

/**
 * Layer 1: fast, deterministic keyword pre-filter for unambiguous crisis language.
 * Phrase-based on purpose (not bare words like "kill" or "die") so normal journalling
 * idiom doesn't trip it — "this deadline is killing me" and "dying of embarrassment"
 * must not match. Catching these here means the common, obvious case never needs a
 * model call at all: instant, free, and not dependent on the model behaving.
 */
const CRISIS_PHRASES: RegExp[] = [
	/\bkill(?:ing)?\s+myself\b/i,
	/\b(?:end|ending)\s+(?:my\s+life|it\s+all)\b/i,
	/\btake\s+my\s+(?:own\s+)?life\b/i,
	/\bsuicid(?:e|al)\b/i,
	/\bwant(?:ed)?\s+to\s+die\b/i,
	/\bdon'?t\s+want\s+to\s+(?:be\s+alive|live\s+anymore|live\s+any\s*more)\b/i,
	/\bno\s+reason\s+to\s+live\b/i,
	/\bbetter\s+off\s+dead\b/i,
	/\bself[-\s]?harm(?:ing)?\b/i,
	/\b(?:hurt|cut|cutting|hurting)\s+myself\b/i,
];

function matchesKnownCrisisPhrase(text: string): boolean {
	return CRISIS_PHRASES.some((pattern) => pattern.test(text));
}

/**
 * Layer 2: a model-based classification, only reached when layer 1 finds nothing.
 * Catches indirect or paraphrased crisis language the fixed phrase list misses,
 * while staying deliberately conservative about what counts — the failure mode we're
 * most worried about here is a journalling app that flinches at ordinary sadness or
 * frustration, which would make the tool feel patronizing and worse to use.
 */
const CLASSIFY_TOOL = {
	name: "classify_crisis_signal",
	description:
		"Classify whether a message shows active suicidal ideation, self-harm intent, or an acute mental health crisis.",
	input_schema: {
		type: "object" as const,
		properties: {
			flagged: {
				type: "boolean" as const,
				description:
					'true ONLY for genuine crisis signal: explicit or clearly implied suicidal ideation, self-harm intent, or a statement of acute danger to oneself. false for sadness, frustration, venting, profanity, idiomatic use of words like "kill"/"die"/"dead", or ordinary difficulty — even when intense. When genuinely unsure, prefer false; this check has a second, human-facing layer, not this classification alone.',
			},
		},
		required: ["flagged"],
	},
};

async function classifyWithModel(text: string): Promise<boolean> {
	const client = getClient();

	const response = await client.messages.create({
		model: MODEL,
		max_tokens: 200,
		tools: [CLASSIFY_TOOL],
		tool_choice: { type: "tool", name: "classify_crisis_signal" },
		messages: [
			{
				role: "user",
				content: `Classify this message, written by a user of a personal journalling app (it may be a question to a reflection assistant, or their own journal text):\n"""\n${text}\n"""`,
			},
		],
	});

	const toolUse = response.content.find((block) => block.type === "tool_use");
	if (toolUse?.type !== "tool_use") return false;

	const input = toolUse.input as { flagged?: boolean };
	return input.flagged === true;
}

/**
 * Two-layer crisis-language check. Returns true when the caller should show the
 * CrisisCheckInModal (see src/app/_components/crisis-check-in-modal.tsx) instead of
 * proceeding normally — used by both chat.ask (the question) and entry.extractText
 * (the OCR'd entry text). All human-facing copy lives in that component, not here:
 * this module only ever returns a boolean, on purpose, so the response the user
 * actually sees is one reviewed, consistent piece of UI, not server-generated text.
 */
export async function checkForCrisisSignal(text: string): Promise<boolean> {
	if (matchesKnownCrisisPhrase(text)) return true;
	return classifyWithModel(text);
}
