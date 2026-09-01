import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { answerQuestion } from "@/server/ai/insights";
import { checkForCrisisSignal } from "@/server/ai/safety";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { decryptManyForUser } from "@/server/crypto/envelope";
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
			// Runs before anything else: a flagged question never reaches the model for a
			// normal answer. The client shows CrisisCheckInModal instead of an answer bubble.
			if (await checkForCrisisSignal(input.question)) {
				console.warn(
					`[safety] crisis signal flagged in chat.ask for user ${ctx.session.user.id}`,
				);
				return { answer: null, crisis: true as const };
			}

			const recentInsights = await ctx.db.query.insights.findMany({
				where: eq(insights.userId, ctx.session.user.id),
				orderBy: desc(insights.createdAt),
				limit: CONTEXT_INSIGHT_LIMIT,
			});
			const decryptedValues = await decryptManyForUser(
				ctx.session.user.id,
				recentInsights.map((insight) => insight.value),
			);
			const decryptedInsights = recentInsights.map((insight, i) => ({
				...insight,
				// biome-ignore lint/style/noNonNullAssertion: decryptedValues has exactly one entry per insight, same order
				value: decryptedValues[i]!,
			}));

			const answer = await answerQuestion(
				ctx.session.user.id,
				input.question,
				decryptedInsights,
				input.history,
			);

			return { answer, crisis: false as const };
		}),
});
