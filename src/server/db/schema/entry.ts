import { index, pgTable } from "drizzle-orm/pg-core";
import { user } from "./user";

export const entries = pgTable(
	"entry",
	(d) => ({
		id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
		text: d.text().notNull(),
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
