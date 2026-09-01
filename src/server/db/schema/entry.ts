import { index, pgTable } from "drizzle-orm/pg-core";
import { user } from "./user";

export const entries = pgTable(
	"entry",
	(d) => ({
		id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
		text: d.text().notNull(),
		/**
		 * The calendar day this entry is about — distinct from createdAt (when the row
		 * was saved). Always supplied explicitly by the client's local date, never
		 * server-defaulted, so a late upload never silently mis-dates the entry.
		 */
		entryDate: d.date({ mode: "string" }).notNull(),
		userId: d
			.text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: d
			.timestamp({ withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
	}),
	(t) => [index("entry_user_id_idx").on(t.userId)],
);
