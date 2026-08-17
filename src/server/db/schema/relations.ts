import { relations } from "drizzle-orm";
import { account } from "./account";
import { entries } from "./entry";
import { insights } from "./insight";
import { session } from "./session";
import { user } from "./user";

export const userRelations = relations(user, ({ many }) => ({
	account: many(account),
	session: many(session),
	entries: many(entries),
	insights: many(insights),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const entryRelations = relations(entries, ({ one, many }) => ({
	user: one(user, { fields: [entries.userId], references: [user.id] }),
	insights: many(insights),
}));

export const insightRelations = relations(insights, ({ one }) => ({
	entry: one(entries, { fields: [insights.entryId], references: [entries.id] }),
	user: one(user, { fields: [insights.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] }),
}));
