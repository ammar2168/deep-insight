import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
	extractInsightsFromText,
	extractTextFromPhotos,
} from "@/server/ai/insights";
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

export const entryRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.entries.findMany({
			where: eq(entries.userId, ctx.session.user.id),
			orderBy: desc(entries.createdAt),
		});
	}),

	/** Stage 1 -> 2: OCR the uploaded photo(s) into raw entry text. */
	extractText: protectedProcedure
		.input(z.object({ photos: z.array(photoInput).min(1).max(10) }))
		.mutation(async ({ input }) => {
			return { text: await extractTextFromPhotos(input.photos) };
		}),

	/** Stage 2 -> 3: extract discrete insights from the (possibly hand-edited) entry text. */
	extractInsights: protectedProcedure
		.input(z.object({ text: z.string().min(1) }))
		.mutation(async ({ input }) => {
			return { insights: await extractInsightsFromText(input.text) };
		}),

	/** Stage 3 save: persist the entry text and whichever insights the user kept. */
	save: protectedProcedure
		.input(
			z.object({
				text: z.string().min(1),
				insights: z.array(insightInput),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return ctx.db.transaction(async (tx) => {
				const [entry] = await tx
					.insert(entries)
					.values({
						text: input.text,
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
