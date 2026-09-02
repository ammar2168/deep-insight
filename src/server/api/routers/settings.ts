import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { user } from "@/server/db/schema";

export const settingsRouter = createTRPCRouter({
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
