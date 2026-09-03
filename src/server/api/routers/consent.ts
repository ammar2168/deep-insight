import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { CURRENT_TERMS_VERSION, hasCurrentConsent } from "@/server/consent";
import { userConsent } from "@/server/db/schema";

export const consentRouter = createTRPCRouter({
	/** Plain protectedProcedure, not consentedProcedure — you must be able to check
	 * this before you've consented, that's the whole point. */
	status: protectedProcedure.query(async ({ ctx }) => {
		return { consented: await hasCurrentConsent(ctx.session.user.id) };
	}),

	accept: protectedProcedure.mutation(async ({ ctx }) => {
		await ctx.db.insert(userConsent).values({
			userId: ctx.session.user.id,
			termsVersion: CURRENT_TERMS_VERSION,
		});
		return { consented: true as const };
	}),
});
