import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appRouter } from "@/server/api/root";
import {
	ACCESS_REQUIRED_MESSAGE,
	CONSENT_REQUIRED_MESSAGE,
	createCallerFactory,
	type createTRPCContext,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import { accessCodes, user, userAccess } from "@/server/db/schema";

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

/**
 * Bypasses real Better Auth session lookup entirely — that's Better Auth's own
 * well-tested concern, not what this test is checking. Only `ctx.session.user.id`
 * is ever actually read by anything under test, so everything else here is a
 * structurally-plausible stand-in, not a faithful reproduction of Better Auth's
 * real session shape.
 */
function contextFor(userId: string): Context {
	const now = new Date();
	return {
		db,
		headers: new Headers(),
		session: {
			user: {
				id: userId,
				name: "Integration Test",
				email: `${userId}@test.local`,
				emailVerified: false,
				image: null,
				createdAt: now,
				updatedAt: now,
			},
			session: {
				id: randomUUID(),
				token: randomUUID(),
				userId,
				expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
				createdAt: now,
				updatedAt: now,
				ipAddress: null,
				userAgent: null,
			},
		},
	} as unknown as Context;
}

const createCaller = createCallerFactory(appRouter);

describe("consent gate + envelope encryption, against a real database", () => {
	const userId = `integration-test-${randomUUID()}`;
	const caller = createCaller(contextFor(userId));

	beforeAll(async () => {
		// user_encryption_key and entries both have a real FK to user.id — the
		// fake session above only fakes the tRPC context, not an actual row, so
		// one has to exist before anything past the consent check will work.
		await db.insert(user).values({
			id: userId,
			name: "Integration Test",
			email: `${userId}@test.local`,
		});
		// Already let into the beta, the way a redeemed or grandfathered account
		// is. The access gate sits in front of consent and has its own tests
		// below; without this, every call here would stop at that gate first
		// and never reach the consent check this block exists to exercise.
		await db.insert(userAccess).values({ userId });
	});

	afterAll(async () => {
		// Deletes the user row outright — every other user-scoped table (session,
		// entries, insights, user_encryption_key) cascades away with it. Also
		// doubles as a real exercise of the account-deletion path itself.
		await caller.settings.deleteAccount().catch(() => {});
	});

	it("rejects data access before consent", async () => {
		// The message matters, not just the code: the access gate also answers
		// FORBIDDEN, so checking the code alone would pass even if it were the
		// access gate doing the blocking and consent were never checked at all.
		await expect(caller.entry.list()).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: CONSENT_REQUIRED_MESSAGE,
		});
	});

	it("allows access after consent, and returns exactly what was saved, decrypted", async () => {
		await caller.consent.accept();

		const plaintext = `Integration test entry ${randomUUID()} — round-trip check.`;
		const saved = await caller.entry.save({
			text: plaintext,
			entryDate: new Date().toISOString().slice(0, 10),
			insights: [],
		});
		expect(saved.entryId).toBeGreaterThan(0);

		const rows = await caller.entry.list();
		const savedEntry = rows.find((r) => r.id === saved.entryId);
		expect(savedEntry?.text).toBe(plaintext);
	});
});

describe("beta access gate, through the real procedure chain", () => {
	const invitedId = `integration-invited-${randomUUID()}`;
	const uninvitedId = `integration-uninvited-${randomUUID()}`;
	const code = `test-code-integration-${randomUUID()}`;
	const invited = createCaller(contextFor(invitedId));
	const uninvited = createCaller(contextFor(uninvitedId));

	beforeAll(async () => {
		await db.insert(user).values([
			{ id: invitedId, name: "Invited", email: `${invitedId}@test.local` },
			{
				id: uninvitedId,
				name: "Uninvited",
				email: `${uninvitedId}@test.local`,
			},
		]);
		await db.insert(accessCodes).values({ code });
	});

	afterAll(async () => {
		// Also proves leaving still works for an account that never got in.
		await invited.settings.deleteAccount().catch(() => {});
		await uninvited.settings.deleteAccount().catch(() => {});
	});

	it("blocks a signed-in account nobody let in, ahead of the consent check", async () => {
		// No consent either — and the answer is still ACCESS_REQUIRED, not
		// CONSENT_REQUIRED, which is what proves access is checked first.
		await expect(uninvited.entry.list()).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: ACCESS_REQUIRED_MESSAGE,
		});
	});

	it("redeeming a code opens the gate for that account, and a forwarded code opens nothing", async () => {
		await invited.settings.redeemCode({ code });

		// Past the access gate now: the next thing in the way is consent, which
		// this account hasn't given. The error moving from ACCESS_REQUIRED to
		// CONSENT_REQUIRED is the gate opening, without writing a consent row.
		await expect(invited.entry.list()).rejects.toMatchObject({
			message: CONSENT_REQUIRED_MESSAGE,
		});

		await expect(uninvited.settings.redeemCode({ code })).rejects.toMatchObject(
			{ code: "BAD_REQUEST" },
		);
		await expect(uninvited.entry.list()).rejects.toMatchObject({
			message: ACCESS_REQUIRED_MESSAGE,
		});
	});
});
