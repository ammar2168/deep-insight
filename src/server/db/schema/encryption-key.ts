import { pgTable } from "drizzle-orm/pg-core";
import { user } from "./user";

/**
 * One row per user: their data-encryption key (DEK), wrapped by the app-wide master
 * key (envelope encryption). userId is the primary key — a 1:1 relationship, not a
 * generic list — so uniqueness is enforced by the key itself, not a separate index.
 */
export const userEncryptionKeys = pgTable("user_encryption_key", (d) => ({
	userId: d
		.text()
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	wrappedDek: d.text().notNull(),
	createdAt: d
		.timestamp({ withTimezone: true })
		.$defaultFn(() => new Date())
		.notNull(),
}));
