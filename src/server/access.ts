import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { accessCodes, chatUsage } from "@/server/db/schema";

export const TRIAL_LENGTH_DAYS = 30;
export const FREE_DAILY_CHAT_LIMIT = 3;
export const BOOSTED_DAILY_CHAT_LIMIT = 7;

export function isTrialExpired(accountCreatedAt: Date): boolean {
	const expiresAt = new Date(accountCreatedAt);
	expiresAt.setUTCDate(expiresAt.getUTCDate() + TRIAL_LENGTH_DAYS);
	return new Date() >= expiresAt;
}

function todayUTC(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Checks whether the user still has chat questions left today and, if so,
 * atomically counts this one against their budget. Only call this right
 * before actually answering the question — a blocked call doesn't consume
 * budget, but an allowed one always does, so calling this speculatively would
 * under-count. Resets the count first if the stored date has rolled past
 * today (UTC) — a fresh calendar day always starts the budget over.
 */
export async function tryConsumeChatQuestion(
	userId: string,
): Promise<{ allowed: boolean; limit: number }> {
	const today = todayUTC();

	const existing = await db.query.chatUsage.findFirst({
		where: eq(chatUsage.userId, userId),
	});

	const limit = existing?.codeRedeemed
		? BOOSTED_DAILY_CHAT_LIMIT
		: FREE_DAILY_CHAT_LIMIT;
	const questionsSoFar =
		existing && existing.usageDate === today ? existing.questionsToday : 0;

	if (questionsSoFar >= limit) {
		return { allowed: false, limit };
	}

	if (!existing) {
		await db
			.insert(chatUsage)
			.values({ userId, questionsToday: 1, usageDate: today })
			.onConflictDoNothing();
	} else if (existing.usageDate !== today) {
		await db
			.update(chatUsage)
			.set({ questionsToday: 1, usageDate: today })
			.where(eq(chatUsage.userId, userId));
	} else {
		await db
			.update(chatUsage)
			.set({ questionsToday: existing.questionsToday + 1 })
			.where(eq(chatUsage.userId, userId));
	}

	return { allowed: true, limit };
}

/**
 * Single-use: a code works for whichever account redeems it first, and never
 * again after — not a shared secret anyone who has it can use. The UPDATE's
 * own WHERE (redeemedAt still null) is what actually enforces that atomically;
 * two simultaneous redemption attempts on the same code both run this UPDATE,
 * but only one can ever affect a row, since the loser's WHERE clause no
 * longer matches once the winner's write lands. Checking "is it used" first
 * with a separate SELECT and then writing would leave a real race window —
 * this doesn't.
 */
export async function redeemAccessCode(
	userId: string,
	code: string,
): Promise<boolean> {
	const [claimed] = await db
		.update(accessCodes)
		.set({ redeemedAt: new Date(), redeemedByUserId: userId })
		.where(and(eq(accessCodes.code, code), isNull(accessCodes.redeemedAt)))
		.returning();

	if (!claimed) return false;

	await db
		.insert(chatUsage)
		.values({ userId, usageDate: todayUTC(), codeRedeemed: true })
		.onConflictDoUpdate({
			target: chatUsage.userId,
			set: { codeRedeemed: true },
		});
	return true;
}
