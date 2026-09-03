import { desc, eq } from "drizzle-orm";

import { consentedProcedure, createTRPCRouter } from "@/server/api/trpc";
import { decryptManyForUser } from "@/server/crypto/envelope";
import { entries, insights } from "@/server/db/schema";
import { rankInsights } from "@/server/insights/priority";

export const insightRouter = createTRPCRouter({
	/** The insights belonging to the user's single most recent entry, capped by construction. */
	latest: consentedProcedure.query(async ({ ctx }) => {
		const latestEntry = await ctx.db.query.entries.findFirst({
			where: eq(entries.userId, ctx.session.user.id),
			orderBy: desc(entries.createdAt),
		});

		if (!latestEntry) return [];

		const rows = await ctx.db.query.insights.findMany({
			where: eq(insights.entryId, latestEntry.id),
		});
		const decryptedValues = await decryptManyForUser(
			ctx.session.user.id,
			rows.map((row) => row.value),
		);
		const decrypted = rows.map((row, i) => ({
			...row,
			// biome-ignore lint/style/noNonNullAssertion: decryptedValues has exactly one entry per row, same order
			value: decryptedValues[i]!,
		}));

		// Category priority decides the "lead" insight now, not extraction order.
		return rankInsights(decrypted);
	}),
});
