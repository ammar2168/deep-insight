import { desc, eq } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { entries, insights } from "@/server/db/schema";
import { rankInsights } from "@/server/insights/priority";

export const insightRouter = createTRPCRouter({
	/** The insights belonging to the user's single most recent entry, capped by construction. */
	latest: protectedProcedure.query(async ({ ctx }) => {
		const latestEntry = await ctx.db.query.entries.findFirst({
			where: eq(entries.userId, ctx.session.user.id),
			orderBy: desc(entries.createdAt),
		});

		if (!latestEntry) return [];

		const rows = await ctx.db.query.insights.findMany({
			where: eq(insights.entryId, latestEntry.id),
		});

		// Category priority decides the "lead" insight now, not extraction order.
		return rankInsights(rows);
	}),
});
