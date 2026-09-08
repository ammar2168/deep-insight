import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { redeemAccessCode } from "@/server/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { user } from "@/server/db/schema";

export const settingsRouter = createTRPCRouter({
	/** Raises the daily chat-question limit for accounts a valid code is entered on. Doesn't touch trial length. */
	redeemCode: protectedProcedure
		.input(z.object({ code: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const redeemed = await redeemAccessCode(ctx.session.user.id, input.code);
			if (!redeemed) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "That code isn't valid.",
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
