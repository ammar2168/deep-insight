import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import {
	extractInsightsFromText,
	extractTextFromPhotos,
} from "@/server/ai/insights";
import { checkForCrisisSignal } from "@/server/ai/safety";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { entries, INSIGHT_CATEGORIES, insights } from "@/server/db/schema";

const photoInput = z.object({
	base64: z.string().min(1),
	mediaType: z.string().min(1),
});

const insightInput = z.object({
	category: z.enum(INSIGHT_CATEGORIES),
	label: z.string().min(1),
	value: z.string().min(1),
});

/**
 * Generous upper bound (server time + 1 day) rather than a strict "today" check —
 * this only needs to catch obviously-wrong input, not precisely enforce "not in the
 * future," which isn't knowable server-side across client timezones anyway.
 */
function maxAllowedEntryDate(): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

const entryDateInput = z
	.string()
	.date()
	.refine((value) => value <= maxAllowedEntryDate(), {
		message: "Entry date can't be in the future.",
	});

const DUPLICATE_CHECK_WINDOW_DAYS = 30;

/** Trimmed, lowercased, whitespace-collapsed before hashing, so trivial formatting
 * differences (extra spaces, a stray capital) still count as the same entry. */
function normalizeAndHashText(text: string): string {
	const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
	return createHash("sha256").update(normalized).digest("hex");
}

export const entryRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.entries.findMany({
			where: eq(entries.userId, ctx.session.user.id),
			orderBy: desc(entries.createdAt),
		});
	}),

	/**
	 * Stage 1 -> 2: OCR the uploaded photo(s) into raw entry text. Also screens the
	 * result for crisis language before the client ever shows it in an editable field —
	 * the client shows CrisisCheckInModal first when `crisis` is true, and only advances
	 * to stage 2 once the user continues past it.
	 */
	extractText: protectedProcedure
		.input(z.object({ photos: z.array(photoInput).min(1).max(10) }))
		.mutation(async ({ ctx, input }) => {
			const text = await extractTextFromPhotos(input.photos);
			const crisis = await checkForCrisisSignal(text);
			if (crisis) {
				console.warn(
					`[safety] crisis signal flagged in entry.extractText for user ${ctx.session.user.id}`,
				);
			}
			return { text, crisis };
		}),

	/** Stage 2 -> 3: extract discrete insights from the (possibly hand-edited) entry text. */
	extractInsights: protectedProcedure
		.input(z.object({ text: z.string().min(1) }))
		.mutation(async ({ input }) => {
			return { insights: await extractInsightsFromText(input.text) };
		}),

	/**
	 * Checks for a recent entry with the same normalized text, so the client can warn
	 * before saving what might be an accidental re-upload. A soft signal, not a block —
	 * scoped to the last DUPLICATE_CHECK_WINDOW_DAYS since a real accidental duplicate is
	 * almost always close in time; an identical-but-unrelated entry months apart shouldn't nag.
	 */
	findPossibleDuplicate: protectedProcedure
		.input(z.object({ text: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const textHash = normalizeAndHashText(input.text);
			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - DUPLICATE_CHECK_WINDOW_DAYS);

			const match = await ctx.db.query.entries.findFirst({
				where: and(
					eq(entries.userId, ctx.session.user.id),
					eq(entries.textHash, textHash),
					gte(entries.createdAt, cutoff),
				),
				orderBy: desc(entries.createdAt),
			});

			return match ? { entryId: match.id, entryDate: match.entryDate } : null;
		}),

	/** Stage 3 save: persist the entry text and whichever insights the user kept. */
	save: protectedProcedure
		.input(
			z.object({
				text: z.string().min(1),
				entryDate: entryDateInput,
				insights: z.array(insightInput),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// The hash is computed on plaintext, always — it must stay comparable across
			// saves regardless of encryption, which is why it's a separate column rather
			// than something derived from the encrypted text later.
			const textHash = normalizeAndHashText(input.text);

			return ctx.db.transaction(async (tx) => {
				const [entry] = await tx
					.insert(entries)
					.values({
						text: input.text,
						textHash,
						entryDate: input.entryDate,
						userId: ctx.session.user.id,
					})
					.returning();

				if (!entry) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to save entry",
					});
				}

				if (input.insights.length > 0) {
					await tx.insert(insights).values(
						input.insights.map((insight) => ({
							entryId: entry.id,
							userId: ctx.session.user.id,
							category: insight.category,
							label: insight.label,
							value: insight.value,
						})),
					);
				}

				return { entryId: entry.id, insightCount: input.insights.length };
			});
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const [deleted] = await ctx.db
				.delete(entries)
				.where(
					and(
						eq(entries.id, input.id),
						eq(entries.userId, ctx.session.user.id),
					),
				)
				.returning();

			if (!deleted) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}

			return deleted;
		}),
});
