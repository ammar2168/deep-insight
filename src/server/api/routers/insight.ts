import { asc, desc, eq } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { entries, insights } from "@/server/db/schema";

export const insightRouter = createTRPCRouter({
	/** The insights belonging to the user's single most recent entry, capped by construction. */
	latest: protectedProcedure.query(async ({ ctx }) => {
		const latestEntry = await ctx.db.query.entries.findFirst({
			where: eq(entries.userId, ctx.session.user.id),
			orderBy: desc(entries.createdAt),
		});

		if (!latestEntry) return [];

		// Ascending id = extraction order = the order the user reviewed and kept them in;
		// the home surface treats the first one as the "lead" insight.
		return ctx.db.query.insights.findMany({
			where: eq(insights.entryId, latestEntry.id),
			orderBy: asc(insights.id),
		});
	}),
});
