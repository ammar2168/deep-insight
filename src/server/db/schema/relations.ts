import { relations } from "drizzle-orm";
import { account } from "./account";
import { entries } from "./entry";
import { session } from "./session";
import { user } from "./user";

export const userRelations = relations(user, ({ many }) => ({
	account: many(account),
	session: many(session),
	entries: many(entries),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const entryRelations = relations(entries, ({ one }) => ({
	user: one(user, { fields: [entries.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] }),
}));
