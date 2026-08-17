import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { entries } from "./entry";
import { user } from "./user";

/**
 * The broad bucket an insight falls into — a small, slow-changing taxonomy. Adding a new
 * category is a one-line migration (`ALTER TYPE insight_category ADD VALUE '...'`); `label`
 * stays free text for anything specific within a category (e.g. a named goal/project).
 */
export const INSIGHT_CATEGORIES = [
	"mood",
	"sleep",
	"movement",
	"relationships",
	"goal",
	"health",
	"other",
] as const;

export const insightCategoryEnum = pgEnum(
	"insight_category",
	INSIGHT_CATEGORIES,
);

export const insights = pgTable(
	"insight",
	(d) => ({
		id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
		entryId: d
			.integer()
			.notNull()
			.references(() => entries.id, { onDelete: "cascade" }),
		userId: d
			.text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		category: insightCategoryEnum().notNull(),
		label: d.text().notNull(),
		value: d.text().notNull(),
		createdAt: d
			.timestamp({ withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("insight_user_id_idx").on(t.userId),
		index("insight_entry_id_idx").on(t.entryId),
	],
);
