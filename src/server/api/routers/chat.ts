import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { answerQuestion } from "@/server/ai/insights";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { insights } from "@/server/db/schema";

const CONTEXT_INSIGHT_LIMIT = 50;

export const chatRouter = createTRPCRouter({
	ask: protectedProcedure
		.input(
			z.object({
				question: z.string().min(1),
				history: z
					.array(z.object({ question: z.string(), answer: z.string() }))
					.default([]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const recentInsights = await ctx.db.query.insights.findMany({
				where: eq(insights.userId, ctx.session.user.id),
				orderBy: desc(insights.createdAt),
				limit: CONTEXT_INSIGHT_LIMIT,
			});

			const answer = await answerQuestion(
				input.question,
				recentInsights,
				input.history,
			);

			return { answer };
		}),
});
