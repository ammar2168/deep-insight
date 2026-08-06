import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { entries } from "@/server/db/schema";

export const entryRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.entries.findMany({
			where: eq(entries.userId, ctx.session.user.id),
			orderBy: desc(entries.createdAt),
		});
	}),

	create: protectedProcedure
		.input(z.object({ text: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const [entry] = await ctx.db
				.insert(entries)
				.values({
					text: input.text,
					userId: ctx.session.user.id,
				})
				.returning();

			return entry;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const [deleted] = await ctx.db
				.delete(entries)
				.where(
					and(
						eq(entries.id, input.id),
						eq(entries.userId, ctx.session.user.id),
					),
				)
				.returning();

			if (!deleted) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}

			return deleted;
		}),
});
