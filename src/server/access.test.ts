import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	BOOSTED_DAILY_CHAT_LIMIT,
	FREE_DAILY_CHAT_LIMIT,
	hasAccessGranted,
	isTrialExpired,
	redeemAccessCode,
	TRIAL_LENGTH_DAYS,
	tryConsumeChatQuestion,
} from "@/server/access";
import { db } from "@/server/db";
import { accessCodes, user, userAccess } from "@/server/db/schema";

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

	it("rejects a code that was never generated, and doesn't change the limit", async () => {
		const redeemed = await redeemAccessCode(
			userId,
			"definitely-not-a-real-code",
		);
		expect(redeemed).toBe(false);
		// Still blocked — a failed redemption must not accidentally raise the limit.
		const stillBlocked = await tryConsumeChatQuestion(userId);
		expect(stillBlocked.allowed).toBe(false);
	});

	it("a real code raises today's limit to the boosted ceiling", async () => {
		const code = `test-code-${randomUUID()}`;
		await db.insert(accessCodes).values({ code });

		const redeemed = await redeemAccessCode(userId, code);
		expect(redeemed).toBe(true);

		const result = await tryConsumeChatQuestion(userId);
		expect(result.allowed).toBe(true);
		expect(result.limit).toBe(BOOSTED_DAILY_CHAT_LIMIT);
		expect(result.codeRedeemed).toBe(true);

		// The scenario the client uses this flag for: once a code-redeemed
		// account is blocked too, codeRedeemed must still read true, so the
		// client can tell "nothing left to enter" apart from "hasn't tried a
		// code yet" and stop offering the redemption prompt.
		for (let i = result.limit - 1; i > 0; i--) {
			await tryConsumeChatQuestion(userId);
		}
		const blockedAfterBoosted = await tryConsumeChatQuestion(userId);
		expect(blockedAfterBoosted.allowed).toBe(false);
		expect(blockedAfterBoosted.codeRedeemed).toBe(true);
	});
});

describe("access codes are single-use, against a real database", () => {
	const userA = `access-test-a-${randomUUID()}`;
	const userB = `access-test-b-${randomUUID()}`;
	const sharedCode = `test-code-shared-${randomUUID()}`;

	beforeAll(async () => {
		await db.insert(user).values([
			{ id: userA, name: "User A", email: `${userA}@test.local` },
			{ id: userB, name: "User B", email: `${userB}@test.local` },
		]);
		await db.insert(accessCodes).values({ code: sharedCode });
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, userA));
		await db.delete(user).where(eq(user.id, userB));
	});

	it("the same code cannot be redeemed by a second account", async () => {
		const first = await redeemAccessCode(userA, sharedCode);
		expect(first).toBe(true);

		// The exact scenario this whole redesign exists to prevent: user A
		// forwards the code to user B, who tries the identical string.
		const second = await redeemAccessCode(userB, sharedCode);
		expect(second).toBe(false);

		// And user B's own limit must still be the free one — redemption
		// failing must not leave any partial effect behind.
		const resultB = await tryConsumeChatQuestion(userB);
		expect(resultB.limit).toBe(FREE_DAILY_CHAT_LIMIT);
	});
});

describe("the beta access gate, against a real database", () => {
	const invited = `access-gate-invited-${randomUUID()}`;
	const uninvited = `access-gate-uninvited-${randomUUID()}`;
	const code = `test-code-gate-${randomUUID()}`;

	beforeAll(async () => {
		await db.insert(user).values([
			{ id: invited, name: "Invited", email: `${invited}@test.local` },
			{ id: uninvited, name: "Uninvited", email: `${uninvited}@test.local` },
		]);
		await db.insert(accessCodes).values({ code });
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, invited));
		await db.delete(user).where(eq(user.id, uninvited));
	});

	it("signing up alone grants nothing, and a spent code grants nothing to anyone else", async () => {
		// Creating an account is not being let in. Both of these users exist and
		// can authenticate; neither can do anything yet.
		expect(await hasAccessGranted(invited)).toBe(false);
		expect(await hasAccessGranted(uninvited)).toBe(false);

		expect(await redeemAccessCode(invited, code)).toBe(true);
		expect(await hasAccessGranted(invited)).toBe(true);

		// The scenario the gate exists for: the invited user forwards their code
		// to someone else, who signed up on their own. Redemption fails, and —
		// the part that actually matters — no access is granted as a side effect.
		expect(await redeemAccessCode(uninvited, code)).toBe(false);
		expect(await hasAccessGranted(uninvited)).toBe(false);
	});

	it("a code nobody ever minted grants nothing", async () => {
		expect(await redeemAccessCode(uninvited, "not-a-real-code")).toBe(false);
		expect(await hasAccessGranted(uninvited)).toBe(false);
	});

	it("records which code let someone in", async () => {
		const row = await db.query.userAccess.findFirst({
			where: eq(userAccess.userId, invited),
		});
		expect(row?.viaCode).toBe(code);
	});
});
