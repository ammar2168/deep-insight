import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { redeemAccessCode } from "@/server/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { user } from "@/server/db/schema";

export const settingsRouter = createTRPCRouter({
	/**
	 * Redeems a single-use code. Two effects, both in one transaction: it grants
	 * the account access to the beta at all (see user_access — no row means the
	 * access gate blocks everything), and it raises the daily chat-question
	 * limit. Doesn't touch trial length.
	 *
	 * Stays on plain protectedProcedure rather than accessGrantedProcedure on
	 * purpose: this is the one call an account with no access yet has to be able
	 * to make, since it's the thing that gets them in.
	 */
	redeemCode: protectedProcedure
		.input(z.object({ code: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const redeemed = await redeemAccessCode(ctx.session.user.id, input.code);
			if (!redeemed) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "That code isn't valid, or it's already been used.",
				});
			}
			return { redeemed: true as const };
		}),

	/**
	 * Deletes the signed-in user's row outright. Every other user-scoped table
	 * (account, session, user_encryption_key, entries, insights) cascades on
	 * userId, so this one delete is enough to remove everything belonging to them.
	 */
	deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
		const [deleted] = await ctx.db
			.delete(user)
			.where(eq(user.id, ctx.session.user.id))
			.returning();

		if (!deleted) {
			throw new TRPCError({ code: "NOT_FOUND" });
		}

		return { deleted: true as const };
	}),
});
