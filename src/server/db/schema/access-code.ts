import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./user";

/**
 * Single-use codes the app owner generates one at a time (see
 * scripts/generate-access-code.mjs) and hands to one specific person
 * personally — not a shared secret. redeemedAt is the source of truth for
 * "already used"; redeemedByUserId is kept for the owner's own reference
 * (who this particular code actually went to) and is nulled rather than
 * cascaded on account deletion, since a code stays permanently spent
 * regardless of what later happens to the account that redeemed it.
 */
export const accessCodes = pgTable("access_code", {
	code: text("code").primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.$defaultFn(() => new Date())
		.notNull(),
	redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
	redeemedByUserId: text("redeemed_by_user_id").references(() => user.id, {
		onDelete: "set null",
	}),
});
