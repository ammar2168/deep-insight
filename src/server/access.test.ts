import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/env";
import {
	BOOSTED_DAILY_CHAT_LIMIT,
	FREE_DAILY_CHAT_LIMIT,
	isTrialExpired,
	redeemAccessCode,
	TRIAL_LENGTH_DAYS,
	tryConsumeChatQuestion,
} from "@/server/access";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

function daysAgo(n: number): Date {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - n);
	return d;
}

describe("isTrialExpired", () => {
	it("is not expired inside the trial window", () => {
		expect(isTrialExpired(daysAgo(TRIAL_LENGTH_DAYS - 1))).toBe(false);
	});

	it("is expired exactly at the boundary and beyond", () => {
		expect(isTrialExpired(daysAgo(TRIAL_LENGTH_DAYS))).toBe(true);
		expect(isTrialExpired(daysAgo(TRIAL_LENGTH_DAYS + 5))).toBe(true);
	});
});

describe("chat usage limits, against a real database", () => {
	const userId = `access-test-${randomUUID()}`;

	beforeAll(async () => {
		await db.insert(user).values({
			id: userId,
			name: "Access Test",
			email: `${userId}@test.local`,
		});
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, userId));
	});

	it("allows exactly the free daily limit, then blocks", async () => {
		for (let i = 0; i < FREE_DAILY_CHAT_LIMIT; i++) {
			const result = await tryConsumeChatQuestion(userId);
			expect(result.allowed).toBe(true);
		}
		const blocked = await tryConsumeChatQuestion(userId);
		expect(blocked.allowed).toBe(false);
		expect(blocked.limit).toBe(FREE_DAILY_CHAT_LIMIT);
	});

	it("rejects a wrong code and doesn't change the limit", async () => {
		const redeemed = await redeemAccessCode(userId, "definitely-not-the-code");
		expect(redeemed).toBe(false);
		// Still blocked — a failed redemption must not accidentally raise the limit.
		const stillBlocked = await tryConsumeChatQuestion(userId);
		expect(stillBlocked.allowed).toBe(false);
	});

	// Only meaningful with a real code configured — skips cleanly rather than
	// failing for anyone running tests without every optional env var set.
	it.skipIf(!env.SPECIAL_ACCESS_CODE)(
		"the real code raises today's limit to the boosted ceiling",
		async () => {
			// biome-ignore lint/style/noNonNullAssertion: skipIf above guarantees this is set
			const redeemed = await redeemAccessCode(userId, env.SPECIAL_ACCESS_CODE!);
			expect(redeemed).toBe(true);

			const result = await tryConsumeChatQuestion(userId);
			expect(result.allowed).toBe(true);
			expect(result.limit).toBe(BOOSTED_DAILY_CHAT_LIMIT);
		},
	);
});
