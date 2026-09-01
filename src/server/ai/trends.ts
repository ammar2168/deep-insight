import "server-only";

import { TRPCError } from "@trpc/server";

import type { TimelineEntry } from "@/server/insights/timeline";
import { getClient, MODEL } from "./client";

export type Candidate = {
	window_start: string;
	window_end: string;
	hypothesis: string;
	involved_categories: string[];
	supporting_excerpts: { date: string; excerpt: string }[];
	confidence: "low" | "medium" | "high";
	leads_or_follows_other_candidates?: string;
};

export type FlagResult = {
	trend_summary: string;
	candidates: Candidate[];
};

export type ConfirmedCandidate = {
	candidate: Candidate;
	still_plausible: boolean;
	confidence: "low" | "medium" | "high";
	refined_hypothesis: string;
	supporting_quotes: { date: string; quote: string }[];
};

const FLAG_TOOL = {
	name: "flag_correlation_candidates",
	description:
		"Record candidate explanations for shifts in a tracked trend, found by looking across all categories.",
	input_schema: {
		type: "object" as const,
		properties: {
			trend_summary: {
				type: "string" as const,
				description:
					"AT MOST 2 short sentences on the overall trajectory: when it changed, in what direction. Not a place to enumerate every window or sub-pattern — that's what candidates are for. Going long here directly eats into the token budget available for candidates, so keep it genuinely brief.",
			},
			candidates: {
				type: "array" as const,
				items: {
					type: "object" as const,
					properties: {
						window_start: {
							type: "string" as const,
							description: "YYYY-MM-DD",
						},
						window_end: { type: "string" as const, description: "YYYY-MM-DD" },
						hypothesis: {
							type: "string" as const,
							description:
								"Phrase as a possibility, never a certainty — 'this could be related to', 'worth noticing that', never 'this caused' or 'this is why'.",
						},
						involved_categories: {
							type: "array" as const,
							items: { type: "string" as const },
						},
						supporting_excerpts: {
							type: "array" as const,
							items: {
								type: "object" as const,
								properties: {
									date: { type: "string" as const, description: "YYYY-MM-DD" },
									excerpt: {
										type: "string" as const,
										description:
											"A verbatim excerpt from that date's index line — the descriptive text, not the leading date/category. Labels sometimes contain their own colon (e.g. 'Goal: Marlowe project'), so don't worry about picking the 'right' colon — quoting from either just after the label's colon or just after the category's colon is fine, as long as every word is copied exactly, not paraphrased.",
									},
								},
								required: ["date", "excerpt"],
							},
							description:
								"The specific index entries this candidate is based on. Every candidate needs at least one — a candidate with nothing real to point to isn't a candidate.",
						},
						confidence: {
							type: "string" as const,
							enum: ["low", "medium", "high"],
						},
						leads_or_follows_other_candidates: {
							type: "string" as const,
							description:
								"Optional. If this candidate's own timing appears to be driven by, or itself explains, another candidate in this list — whether they're in the same rough window or in a separate, distant episode — describe that ordering here, with specific dates. If the same categories show more than one distinct episode across the period, explicitly compare each episode's own order rather than assuming a later one repeats an earlier one's pattern — say so if the order is the same, and say so, just as clearly, if it's different. Leave empty if this candidate looks independent of the others.",
						},
					},
					required: [
						"window_start",
						"window_end",
						"hypothesis",
						"involved_categories",
						"supporting_excerpts",
						"confidence",
					],
				},
			},
		},
		required: ["trend_summary", "candidates"],
	},
};

const FLAG_SYSTEM = `You are analyzing a personal journal's extracted insight index to answer a trend question about the writer's history. You will be given every insight recorded across the period, tagged with date and category (mood, sleep, movement, relationships, goal, health, other).

Your job: look for anything — in ANY category, not just the one the question is about — that coincides in time with shifts in the trend being asked about. Do not limit yourself to same-category insights; the real explanation for a shift is often in a category that has no obvious topical connection (e.g. a health or goal entry, not a sleep entry, might coincide with a sleep change). Do not just report the "obvious" co-movement (e.g. mood dipping alongside the trend) if there's a less obvious, more specific coincidence available — surface both if genuinely present, but prioritize non-obvious, specific candidates.

When two or more candidates seem to move in the same rough window, check whether they actually started on the same day or whether one led and the others followed a few days later — on BOTH the onset and the recovery side. A staggered start or a staggered recovery is itself meaningful evidence of a possible chain (A affecting B affecting C), not just simultaneous co-occurrence, and it's easy to miss if you only check "did these happen around the same time" instead of comparing exact dates against each other. Report a staggered relationship explicitly, with dates, using the leads_or_follows_other_candidates field — don't describe things as moving "together" if the actual dates show one clearly leading.

If the same categories show trouble in more than one separate window across the period — not one continuous stretch, but distinct episodes with a real return to baseline in between — check each episode's own lead/follow order from scratch. Do NOT assume a later episode repeats an earlier one's order just because the same categories are involved. Compare the actual dates within each episode independently. If the order is the same across episodes, that consistency is itself meaningful and worth stating. If the order is different — one category led in the first episode but a different one led in the second — that's equally meaningful and more likely to be missed, since it's tempting to describe a second episode using the first one's already-established framing rather than re-checking it. State explicitly, per episode, which category's dates come first.

The index entries you're given are sometimes short, plain, or repetitive — that's real, not a gap for you to fill in. Describe what's actually there, even if it's generic. Do not invent more specific or elaborate content (an event, an activity, a detail) than what the index line actually says.

Never assert causation. Every hypothesis must be phrased as a possibility for the writer to consider, not a conclusion, and every supporting_excerpts entry must be a verbatim substring of a real index line — never invent a date or a detail that isn't actually in the index. Every excerpt you cite will be checked against the real index and discarded, along with the whole candidate if nothing survives, so treat that as a hard rule, not a suggestion.`;

/** Tier 2, stage 1: find candidate correlations by scanning the full Tier 1 index. */
export async function flagCorrelationCandidates(
	question: string,
	timeline: TimelineEntry[],
	traceId = "untraced",
): Promise<FlagResult> {
	const indexText = timeline
		.map((t) => `[${t.entryDate}] ${t.category} | ${t.label}: ${t.value}`)
		.join("\n");

	const client = getClient();
	const response = await client.messages.create({
		model: MODEL,
		// Generous headroom, not tuned to a specific test's data: several
		// well-grounded candidates (each with multiple verbatim excerpts) is a lot of
		// required output, and richer source text means longer excerpts — this hit the
		// old 2048 cap mid-generation on real, not-especially-large test data.
		max_tokens: 4096,
		system: FLAG_SYSTEM,
		tools: [FLAG_TOOL],
		tool_choice: { type: "tool", name: "flag_correlation_candidates" },
		messages: [
			{
				role: "user",
				content: `Question: "${question}"\n\nFull insight index for the period:\n${indexText}`,
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
	const result = toolUse.input as FlagResult;

	// Always-on, not just on failure: the only way to know how close a given input
	// size is running to the ceiling before it actually breaks is to see the number
	// every time, not just after it's already a problem.
	console.log(
		`[trend-analysis:${traceId}] flag call used ${response.usage.output_tokens} output tokens (stop_reason: ${response.stop_reason})`,
	);
	// Silent truncation is a subtler risk than a loud parse failure: hitting the token
	// cap can still leave behind JSON that parses fine but is missing candidates or
	// excerpts the model never got to write. Worth knowing about even when nothing
	// downstream actually breaks.
	if (response.stop_reason === "max_tokens") {
		console.warn(
			`[trend-analysis:${traceId}] flag call hit max_tokens (${response.usage.output_tokens} output tokens) — result may be silently incomplete even though it parsed`,
		);
	}

	// Diagnostic, not just defensive: if the shape is ever wrong, say exactly what it
	// actually was instead of failing later with an opaque "X is not a function" a few
	// lines down with no way to tell what the model actually returned.
	if (!Array.isArray(result?.candidates)) {
		console.error(
			`[trend-analysis:${traceId}] flag tool returned a malformed shape: ${JSON.stringify(toolUse.input)} | stop_reason: ${response.stop_reason} | usage: ${JSON.stringify(response.usage)}`,
		);
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `flag_correlation_candidates returned candidates as ${typeof result?.candidates}, not an array`,
		});
	}

	// Hard, mechanical check, mirroring Stage 2's quote verification: a candidate's
	// dates and content claims are a prompt-level promise, not a runtime guarantee.
	// Every excerpt has to trace back to something that's actually in the index.
	//
	// Accepts a match against the bare value OR "label: value" OR the full formatted
	// line, not just the bare value — real index lines look like "category | label:
	// value", and labels themselves often contain their own colon by convention (e.g.
	// "Goal: Marlowe project", straight from the extraction prompt), so "the part
	// after the colon" is genuinely ambiguous for the model to parse consistently.
	// Rejecting a citation that includes its own real label would be punishing an
	// honest, fully-grounded quote for a wording ambiguity in our own instructions —
	// the safety property that matters (every excerpt is a real, verbatim substring
	// of something actually in the index) holds regardless of which of these forms
	// it's checked against.
	const realValuesByDate = new Map<string, string[]>();
	for (const t of timeline) {
		const existing = realValuesByDate.get(t.entryDate) ?? [];
		existing.push(
			t.value,
			`${t.label}: ${t.value}`,
			`${t.category} | ${t.label}: ${t.value}`,
		);
		realValuesByDate.set(t.entryDate, existing);
	}

	const verifiedCandidates = (result.candidates ?? [])
		.map((c) => {
			const verifiedExcerpts = (c.supporting_excerpts ?? []).filter((e) => {
				const sourcesForDate = realValuesByDate.get(e.date) ?? [];
				const isGrounded = sourcesForDate.some((v) => v.includes(e.excerpt));
				if (!isGrounded) {
					console.warn(
						`[trend-analysis:${traceId}] dropped an unverified excerpt claimed for ${e.date} — not a real substring of that day's index`,
					);
				}
				return isGrounded;
			});
			return { ...c, supporting_excerpts: verifiedExcerpts };
		})
		.filter((c) => c.supporting_excerpts.length > 0);

	if (verifiedCandidates.length < (result.candidates ?? []).length) {
		console.warn(
			`[trend-analysis:${traceId}] dropped ${(result.candidates ?? []).length - verifiedCandidates.length} candidate(s) with zero verifiable excerpts`,
		);
	}

	return {
		trend_summary: result.trend_summary,
		candidates: verifiedCandidates,
	};
}

const CONFIRM_TOOL = {
	name: "confirm_candidate",
	description:
		"Confirm, refine, or discard a candidate explanation after reading the actual raw journal text for the relevant days.",
	input_schema: {
		type: "object" as const,
		properties: {
			still_plausible: { type: "boolean" as const },
			confidence: {
				type: "string" as const,
				enum: ["low", "medium", "high"],
				description:
					"Your own confidence after reading the raw text — may be higher or lower than the initial pass's guess, since you now have direct evidence rather than just a compact summary.",
			},
			refined_hypothesis: {
				type: "string" as const,
				description:
					"Still phrased as a possibility, not a certainty. Update or discard based on what the raw text actually shows.",
			},
			supporting_quotes: {
				type: "array" as const,
				items: {
					type: "object" as const,
					properties: {
						date: { type: "string" as const },
						quote: {
							type: "string" as const,
							description:
								"A short verbatim excerpt from the provided raw text — must be an exact substring, not a paraphrase.",
						},
					},
					required: ["date", "quote"],
				},
			},
		},
		required: [
			"still_plausible",
			"confidence",
			"refined_hypothesis",
			"supporting_quotes",
		],
	},
};

const CONFIRM_SYSTEM = `You are confirming or refining a candidate explanation using the actual raw journal text, after an initial broad pass flagged it from a compact index alone.

Do not require the effect to appear on the very first day of the window — real effects (a new medication, a habit change, a stressor) often take a few days to show up, and a short gap between the trigger and the first sign of an effect is normal and expected, not evidence against the hypothesis. Judge the hypothesis by the overall pattern across the FULL window, not by whether the first 1-2 days fit — recurring or repeated evidence spread through the window counts for more than early alignment. A hypothesis can still be plausible even if some individual days within the window don't fit; weigh the balance of evidence, not perfect day-by-day matching. If two candidates both have partial support, it's fine to say both may be contributing rather than picking one winner.

Set confidence based on what the raw text actually shows, not what the initial pass guessed — clear, specific, repeated evidence in the raw text can justify higher confidence than the first pass assigned; thinner or more ambiguous raw text can justify lower confidence than it assigned.

The raw text you're given is sometimes short, plain, or repetitive — that's real, not a sign you're missing something. Quote it exactly as it actually reads, even if that's a short, generic sentence repeated across several days. Do not invent additional narrative detail, dialogue, emotional specificity, or events to make the evidence sound more substantial or complete than it is — a made-up quote is a serious failure, categorically worse than an honest "there isn't much to go on here." Every quote you return will be checked against the actual text and discarded if it isn't a real, exact substring, so treat that as a hard rule, not a suggestion.

Still never assert causation — phrase any surviving hypothesis as a possibility.`;

/**
 * Tier 2, stage 2: confirm one candidate against the actual raw entry text for its
 * flagged window (plus a couple of padding days either side) — never the full range.
 */
export async function confirmCandidate(
	candidate: Candidate,
	rawText: { entryDate: string; text: string }[],
	traceId = "untraced",
): Promise<ConfirmedCandidate> {
	const rawBlock = rawText.map((r) => `[${r.entryDate}] ${r.text}`).join("\n");

	const client = getClient();
	const response = await client.messages.create({
		model: MODEL,
		max_tokens: 2048,
		system: CONFIRM_SYSTEM,
		tools: [CONFIRM_TOOL],
		tool_choice: { type: "tool", name: "confirm_candidate" },
		messages: [
			{
				role: "user",
				content: `Candidate hypothesis from an initial index-only pass: "${candidate.hypothesis}" (window ${candidate.window_start} to ${candidate.window_end})

Here is the actual raw journal text for the specific days that hypothesis was based on, plus a couple of surrounding days:

${rawBlock}

Confirm or refine the hypothesis using this raw text. Pull real short quotes as evidence — they must be verbatim substrings of the text above, not paraphrases.`,
			},
		],
	});

	console.log(
		`[trend-analysis:${traceId}] confirm call used ${response.usage.output_tokens} output tokens (stop_reason: ${response.stop_reason})`,
	);
	if (response.stop_reason === "max_tokens") {
		console.warn(
			`[trend-analysis:${traceId}] confirm call hit max_tokens (${response.usage.output_tokens} output tokens) — result may be silently incomplete even though it parsed`,
		);
	}

	const toolUse = response.content.find((block) => block.type === "tool_use");
	if (toolUse?.type !== "tool_use") {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Couldn't read a structured response from the model",
		});
	}
	const result = toolUse.input as Omit<ConfirmedCandidate, "candidate">;

	// Hard, mechanical check — "must be a verbatim substring" is a prompt-level
	// promise, not a runtime guarantee, and empirically the model does sometimes
	// invent a plausible-sounding quote instead of admitting the raw text is thin.
	// Never trust it; verify every quote against the actual text it claims to be from.
	const rawTextByDate = new Map(rawText.map((r) => [r.entryDate, r.text]));
	const verifiedQuotes = (result.supporting_quotes ?? []).filter((q) => {
		const source = rawTextByDate.get(q.date);
		const isGrounded = typeof source === "string" && source.includes(q.quote);
		if (!isGrounded) {
			console.warn(
				`[trend-analysis:${traceId}] dropped an unverified quote claimed for ${q.date} — not an exact substring of that day's actual text`,
			);
		}
		return isGrounded;
	});

	// If every quote offered turned out fabricated, the "confirmation" itself isn't
	// trustworthy — don't let its prose (which can just as easily reference invented
	// detail) carry forward into the final answer unchecked.
	if (
		(result.supporting_quotes ?? []).length > 0 &&
		verifiedQuotes.length === 0
	) {
		console.warn(
			`[trend-analysis:${traceId}] quarantined a candidate — every quote it offered was unverified`,
		);
		return {
			candidate,
			still_plausible: false,
			confidence: "low",
			refined_hypothesis:
				"This looked like a possible pattern from the summary alone, but the supporting evidence didn't hold up when checked against the actual entries, so it's being left out.",
			supporting_quotes: [],
		};
	}

	return { candidate, ...result, supporting_quotes: verifiedQuotes };
}

const SYNTHESIZE_SYSTEM = `You are a reflective journalling assistant. Answer the user's trend question warmly and concisely, in markdown. Never assert that one thing caused another — every possible explanation must be hedged ("could be related to", "worth considering", "you might look into") and grounded in the specific evidence given, not invented. Cite concrete evidence (dates, and quotes if given) rather than speaking in generalities.

Lead with whatever has the strongest, most consistent evidence — don't present every candidate as equally weighted just because they're all listed; a high-confidence, well-supported finding deserves more space and a more prominent place than a low-confidence one. If the evidence shows one factor's timing leading and others trailing (a staggered onset or recovery, not simultaneous), make that ordering explicit — it's often the most informative part of a multi-category pattern, since it points at what looks upstream versus what looks like a downstream symptom.

If the evidence spans more than one distinct episode, don't describe a later episode using the same "X leads Y" framing already established for an earlier one without checking — the "Possible chain" notes on each candidate may show a different order for a different episode, and if they do, say so plainly (e.g. "unlike the first stretch, this time it was work that dipped first"). That contrast is a real, useful finding, not a loose end to smooth over into one uniform story.

Close by turning the finding into something the user can actually act on, not just a summary of what happened. Be specific: name a concrete thing to watch for going forward, a specific question worth raising with someone relevant (e.g. a doctor, if a medication is involved), or a specific self-check that would help confirm or rule out the hypothesis. Avoid vague closers like "worth keeping an eye on" with nothing concrete attached. Never give directive advice ("you should stop X", "you should do Y") — medical, relationship, or otherwise; the goal is to sharpen the user's own thinking and next move, not decide for them.`;

/** Final step: turn the trend summary plus whatever survived confirmation into a hedged, evidence-grounded, actionable answer. */
export async function synthesizeTrendAnswer(
	question: string,
	trendSummary: string,
	confirmed: ConfirmedCandidate[],
	traceId = "untraced",
): Promise<string> {
	const confidenceRank = { high: 2, medium: 1, low: 0 };
	const ordered = [...confirmed].sort((a, b) => {
		if (a.still_plausible !== b.still_plausible)
			return a.still_plausible ? -1 : 1;
		return confidenceRank[b.confidence] - confidenceRank[a.confidence];
	});

	const evidence = `Trend summary: ${trendSummary}\n\nCandidates, strongest evidence first:\n${ordered
		.map((c) => {
			const chainNote = c.candidate.leads_or_follows_other_candidates
				? `\n  Possible chain: ${c.candidate.leads_or_follows_other_candidates}`
				: "";
			const status = c.still_plausible
				? `[plausible, confidence: ${c.confidence}]`
				: "[largely ruled out after reading raw text]";
			const quotes =
				(c.supporting_quotes ?? [])
					.map((q) => `[${q.date}] "${q.quote}"`)
					.join(" | ") || "(none)";
			return `- ${status} ${c.refined_hypothesis}${chainNote}\n  Quotes: ${quotes}`;
		})
		.join("\n")}`;

	const client = getClient();
	const response = await client.messages.create({
		model: MODEL,
		max_tokens: 2048,
		system: SYNTHESIZE_SYSTEM,
		messages: [
			{
				role: "user",
				content: `Question: "${question}"\n\nEvidence:\n${evidence}`,
			},
		],
	});

	console.log(
		`[trend-analysis:${traceId}] synthesis call used ${response.usage.output_tokens} output tokens (stop_reason: ${response.stop_reason})`,
	);
	if (response.stop_reason === "max_tokens") {
		console.warn(
			`[trend-analysis:${traceId}] synthesis call hit max_tokens (${response.usage.output_tokens} output tokens) — final answer may be cut off mid-sentence`,
		);
	}

	const textBlock = response.content.find((block) => block.type === "text");
	if (textBlock?.type !== "text") {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Couldn't read a response from the model",
		});
	}
	return textBlock.text.trim();
}
