import { boolean, date, integer, pgTable, text } from "drizzle-orm/pg-core";
import { user } from "./user";

/**
 * One row per user, tracking their daily chat-question budget during the free
 * trial. `questionsToday`/`usageDate` together form the reset mechanic — a
 * question increments the count only after confirming usageDate is still
 * today (UTC); a stale date means the day rolled over, so the count resets to
 * 1 instead of incrementing. codeRedeemed raises the daily limit for accounts
 * a special-access code was entered on — see src/server/access.ts.
 */
export const chatUsage = pgTable("chat_usage", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	questionsToday: integer("questions_today").notNull().default(0),
	usageDate: date("usage_date", { mode: "string" }).notNull(),
	codeRedeemed: boolean("code_redeemed").notNull().default(false),
});
