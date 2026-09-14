import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./user";

/**
 * One row per account that's allowed into the beta at all — the hard gate,
 * checked right after authentication and before anything else (trial,
 * consent, any data access). No row means no access, full stop.
 *
 * Deliberately separate from access_code rather than reading
 * access_code.redeemedByUserId directly, for two reasons: that column is
 * nulled on account deletion (a code stays spent, but stops pointing at
 * anyone), and accounts that predate this gate were granted access without
 * ever redeeming a code at all. viaCode records which code let someone in
 * when there was one, and stays null for those grandfathered accounts.
 */
export const userAccess = pgTable("user_access", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	grantedAt: timestamp("granted_at", { withTimezone: true })
		.$defaultFn(() => new Date())
		.notNull(),
	viaCode: text("via_code"),
});
