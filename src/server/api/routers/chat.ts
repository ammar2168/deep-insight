import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { tryConsumeChatQuestion } from "@/server/access";
import { answerQuestion } from "@/server/ai/insights";
import { checkForCrisisSignal } from "@/server/ai/safety";
import { consentedProcedure, createTRPCRouter } from "@/server/api/trpc";
import { decryptManyForUser } from "@/server/crypto/envelope";
import { insights } from "@/server/db/schema";

const CONTEXT_INSIGHT_LIMIT = 50;

export const chatRouter = createTRPCRouter({
	ask: consentedProcedure
		.input(
			z.object({
				question: z.string().min(1),
				history: z
					.array(z.object({ question: z.string(), answer: z.string() }))
					.default([]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Runs before anything else, including the daily question limit below: a
			// flagged question always gets the crisis check-in regardless of remaining
			// budget — safety takes priority over cost control here, on purpose. Never
			// "optimize" this by moving the limit check first.
			if (await checkForCrisisSignal(input.question)) {
				console.warn(
					`[safety] crisis signal flagged in chat.ask for user ${ctx.session.user.id}`,
				);
				return {
					answer: null,
					crisis: true as const,
					limitReached: false as const,
				};
			}

			const { allowed, limit, codeRedeemed } = await tryConsumeChatQuestion(
				ctx.session.user.id,
			);
			if (!allowed) {
				return {
					answer: null,
					crisis: false as const,
					limitReached: true as const,
					dailyLimit: limit,
					// Lets the client decide whether "have a code?" even makes sense to
					// show — someone who already redeemed one and hit the boosted
					// ceiling has nothing left to enter, that prompt is only for
					// someone still on the free tier.
					codeRedeemed,
				};
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

			return { answer, crisis: false as const, limitReached: false as const };
		}),
});
