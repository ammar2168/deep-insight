import { index, pgTable } from "drizzle-orm/pg-core";

/**
 * Proof that a user accepted the terms before the app processed anything of
 * theirs — not just a client-side click. Deliberately has no foreign key to
 * `user`: this is an audit record of consent that existed at the time data was
 * processed, so unlike every other table here it must survive account
 * deletion rather than cascade away with it. userId is stored as plain text
 * for that reason, not a relation.
 */
export const userConsent = pgTable(
	"user_consent",
	(d) => ({
		id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: d.text().notNull(),
		termsVersion: d.text().notNull(),
		consentedAt: d
			.timestamp({ withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
	}),
	(t) => [index("user_consent_user_id_idx").on(t.userId)],
);
